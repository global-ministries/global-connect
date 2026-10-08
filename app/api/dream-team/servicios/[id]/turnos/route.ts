import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseDreamTeamRepository } from '@/lib/platform/dream-team/repository-supabase'
import {
  hasDreamTeamReadCapability,
  hasDreamTeamWriteCapability,
  isDreamTeamEnabled,
  requireDreamTeamSession,
} from '@/lib/platform/dream-team/route-access'
import {
  fetchFrecuenciasDeServicios,
  fetchTurnos,
  fetchTurnosDeServicios,
  fetchTurnosDisponibles,
  guardarTurnosDeServicio,
  validarFrecuencias,
  validarTurnoIds,
} from '@/lib/platform/dream-team/turnos'

/**
 * The service shifts of one servicio (D12).
 *
 * GET  → { turnos, asignados, frecuencias }: the shifts the servicio's node serves in (after
 *        inheritance) plus any already assigned, so a shift that stopped being
 *        offered can still be seen and removed. `frecuencias` lists the biweekly
 *        ones (T10); the rest are weekly.
 * PUT  { turnoIds, frecuencias? } → { asignados }: replaces the assignment;
 *        `frecuencias` (turnoId → { frecuencia, fechaAncla }) sets each shift's
 *        frequency, unlisted ones weekly; without it stored ones are kept. RLS lets the
 *        same people who edit the servicio do it; a trigger rejects a shift of
 *        another campus, an inactive one or one the node does not serve (422).
 */

type Ctx = { params: Promise<{ id: string }> | { id: string } }
const resolveId = async (ctx: Ctx) => ('then' in ctx.params ? await ctx.params : ctx.params).id

function codigo(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    if (!isDreamTeamEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const s = await requireDreamTeamSession()
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (!hasDreamTeamReadCapability(s)) return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    const id = await resolveId(ctx)
    const supabase = await createSupabaseServerClient()
    const servicio = await createSupabaseDreamTeamRepository(supabase).getServicioById(id)
    if (!servicio) return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })

    const turnos = await fetchTurnos(supabase)
    const [disponibles, porServicio, frecuenciasPorServicio] = await Promise.all([
      fetchTurnosDisponibles(supabase, servicio.equipoId, turnos),
      fetchTurnosDeServicios(supabase, [id]),
      fetchFrecuenciasDeServicios(supabase, [id]),
    ])
    const asignados = porServicio.get(id) ?? []
    const ofrecidos = new Set([...disponibles, ...asignados])
    return NextResponse.json({
      turnos: turnos.filter((turno) => ofrecidos.has(turno.id)),
      asignados,
      frecuencias: frecuenciasPorServicio.get(id) ?? {},
    })
  } catch (error) {
    console.error('[dream-team/servicios/[id]/turnos] GET error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    if (!isDreamTeamEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const s = await requireDreamTeamSession()
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (!hasDreamTeamWriteCapability(s)) return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    const id = await resolveId(ctx)

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }
    const validacion = validarTurnoIds((body as { turnoIds?: unknown } | null)?.turnoIds)
    if (!validacion.ok) return NextResponse.json({ error: validacion.message }, { status: 400 })
    const frecuencias = validarFrecuencias((body as { frecuencias?: unknown }).frecuencias, validacion.turnoIds)
    if (!frecuencias.ok) return NextResponse.json({ error: frecuencias.message }, { status: 400 })

    const supabase = await createSupabaseServerClient()
    const servicio = await createSupabaseDreamTeamRepository(supabase).getServicioById(id)
    if (!servicio) return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })

    try {
      await guardarTurnosDeServicio(supabase, id, validacion.turnoIds, frecuencias.frecuencias)
    } catch (error) {
      if (codigo(error) === '23514') {
        return NextResponse.json(
          { error: 'Ese turno no está disponible para este equipo o para el campus de la persona.' },
          { status: 422 },
        )
      }
      if (codigo(error) === '42501') return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
      throw error
    }
    return NextResponse.json({ asignados: validacion.turnoIds })
  } catch (error) {
    console.error('[dream-team/servicios/[id]/turnos] PUT error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
