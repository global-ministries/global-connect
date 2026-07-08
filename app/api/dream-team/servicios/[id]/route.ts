import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseDreamTeamRepository } from '@/lib/platform/dream-team/repository-supabase'
import { hasDreamTeamReadCapability, hasDreamTeamWriteCapability, isDreamTeamEnabled, requireDreamTeamSession } from '@/lib/platform/dream-team/route-access'
import { DREAM_TEAM_MOTIVOS } from '@/lib/platform/dream-team/types'
import type { DreamTeamEstado, DreamTeamMotivo } from '@/lib/platform/dream-team/types'
import { transition } from '@/lib/platform/dream-team/state-machine'

type Ctx = { params: Promise<{ id: string }> | { id: string } }
const resolveId = async (ctx: Ctx) => ('then' in ctx.params ? await ctx.params : ctx.params).id
const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 })

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    if (!isDreamTeamEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const s = await requireDreamTeamSession()
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (!hasDreamTeamReadCapability(s)) return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    const id = await resolveId(ctx)
    const repo = createSupabaseDreamTeamRepository(await createSupabaseServerClient())
    const servicio = await repo.getServicioById(id)
    if (!servicio) return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })
    const [historial, verificaciones] = await Promise.all([repo.listHistorial(id), repo.listRequisitoVerificaciones(id)])
    return NextResponse.json({ servicio, historial, verificaciones })
  } catch (error) {
    console.error('[dream-team/servicios/[id]] GET error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    if (!isDreamTeamEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const s = await requireDreamTeamSession()
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (!hasDreamTeamWriteCapability(s)) return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    const id = await resolveId(ctx)
    let body: unknown
    try { body = await req.json() } catch { return bad('Body inválido') }
    if (!body || typeof body !== 'object') return bad('Body inválido')
    const { estado, motivo, detalleMotivo, expectedVersion } = body as Record<string, unknown>
    if (!motivo || typeof motivo !== 'string' || !DREAM_TEAM_MOTIVOS.includes(motivo as never)) return bad('motivo es requerido y debe ser válido')
    if (expectedVersion === undefined || typeof expectedVersion !== 'number') return bad('expectedVersion es requerido')
    if (!estado || typeof estado !== 'string') return bad('estado es requerido')
    const repo = createSupabaseDreamTeamRepository(await createSupabaseServerClient())
    const servicio = await repo.getServicioById(id)
    if (!servicio) return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })
    const t = transition({ servicio, estadoNuevo: estado as DreamTeamEstado, motivo: motivo as DreamTeamMotivo, fecha: new Date().toISOString() })
    if (!t.ok) return NextResponse.json({ error: t.error.message }, { status: 400 })
    try {
      const updated = await repo.updateServicio(id, { estado: estado as DreamTeamEstado, motivoActual: motivo as DreamTeamMotivo, detalleMotivo: typeof detalleMotivo === 'string' ? detalleMotivo : undefined, expectedVersion })
      return NextResponse.json({ servicio: updated, historial: await repo.listHistorial(id) })
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'CONCURRENCY_CONFLICT') return NextResponse.json({ error: 'Conflicto de versión' }, { status: 409 })
      throw error
    }
  } catch (error) {
    console.error('[dream-team/servicios/[id]] PATCH error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
