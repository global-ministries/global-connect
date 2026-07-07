import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseDreamTeamRepository } from '@/lib/platform/dream-team/repository-supabase'
import { hasDreamTeamReadCapability, hasDreamTeamWriteCapability, isDreamTeamEnabled, requireDreamTeamSession } from '@/lib/platform/dream-team/route-access'
import { DREAM_TEAM_ESTADOS, DREAM_TEAM_MOTIVOS, personaId } from '@/lib/platform/dream-team/types'
import type { DreamTeamEstado, DreamTeamMotivo } from '@/lib/platform/dream-team/types'
import type { DreamTeamServicioFiltros } from '@/lib/platform/dream-team/repository'
import { randomUUID } from 'node:crypto'

const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 })

function parseFiltros(searchParams: URLSearchParams): DreamTeamServicioFiltros | { error: string } {
  const f: Record<string, unknown> = {}
  const p = searchParams.get('personaId')?.trim()
  if (p) f.personaId = personaId(p)
  const e = searchParams.get('equipoId')?.trim()
  if (e) f.equipoId = e
  const r = searchParams.get('rolId')?.trim()
  if (r) f.rolId = r
  const estados = searchParams.getAll('estado').map((v) => v.trim()).filter(Boolean)
  if (estados.length) {
    const invalidos = estados.filter((v) => !DREAM_TEAM_ESTADOS.includes(v as DreamTeamEstado))
    if (invalidos.length) return { error: `estados inválidos: ${invalidos.join(', ')}` }
    f.estado = estados as DreamTeamEstado[]
  }
  return f as DreamTeamServicioFiltros
}

export async function GET(req: NextRequest) {
  try {
    if (!isDreamTeamEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const s = await requireDreamTeamSession()
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (!hasDreamTeamReadCapability(s)) return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    const parsed = parseFiltros(new URL(req.url).searchParams)
    if ('error' in parsed) return bad(parsed.error)
    const repo = createSupabaseDreamTeamRepository(await createSupabaseServerClient())
    return NextResponse.json({ servicios: await repo.listServicios(parsed) })
  } catch (error) {
    console.error('[dream-team/servicios] GET error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isDreamTeamEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const s = await requireDreamTeamSession()
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (!hasDreamTeamWriteCapability(s)) return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    let body: unknown
    try { body = await req.json() } catch { return bad('Body inválido') }
    if (!body || typeof body !== 'object') return bad('Body inválido')
    const { personaId: pid, equipoId, rolId, motivo } = body as Record<string, unknown>
    if (!pid || !equipoId || !rolId || typeof pid !== 'string' || typeof equipoId !== 'string' || typeof rolId !== 'string') {
      return bad('personaId, equipoId y rolId son requeridos')
    }
    if (motivo !== undefined && (typeof motivo !== 'string' || !DREAM_TEAM_MOTIVOS.includes(motivo as never))) return bad('motivo inválido')
    const repo = createSupabaseDreamTeamRepository(await createSupabaseServerClient())
    if (!(await repo.listEquipos()).some((x) => x.id === equipoId)) return bad('Equipo no encontrado')
    if (!(await repo.listRolesPorEquipo(equipoId)).some((x) => x.id === rolId)) return bad('Rol no encontrado')
    const motivoActual = ((motivo as DreamTeamMotivo | undefined) ?? 'admin_asignacion') as DreamTeamMotivo
    const servicio = await repo.createServicio({ personaId: personaId(pid), equipoId, rolId, estado: 'postulado', fechaInicio: new Date().toISOString(), motivoActual })
    const requisitos = await repo.listRequisitosPorRol(rolId)
    const verificaciones = await Promise.all(requisitos.map((r) => repo.upsertRequisitoVerificacion({ id: randomUUID(), servicioId: servicio.id, requisitoId: r.id, estado: 'pendiente' })))
    await repo.appendHistorial({ servicioId: servicio.id, estadoAnterior: 'postulado', estadoNuevo: 'postulado', motivo: motivoActual, actorPersonaId: personaId(s.personaId), fecha: new Date().toISOString() })
    return NextResponse.json({ servicio, verificaciones, historial: await repo.listHistorial(servicio.id) }, { status: 201 })
  } catch (error) {
    console.error('[dream-team/servicios] POST error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
