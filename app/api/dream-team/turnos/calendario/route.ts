/**
 * Dream Team — GET /api/dream-team/turnos/calendario?equipoId= (T2 of
 * odd/tasks/tlr-calendario-servicios.md, A2).
 *
 * → { turnos: [{ id, nombre, hora, puedeGestionar, fechas }] }: the active
 * dated shifts the node serves (dream_team_turnos_del_equipo: only where the
 * node or an ancestor lists them), each with its planned dates and who serves
 * on each, plus whether the caller may plan them (A1,
 * dream_team_puede_gestionar_turno). Mi equipo shows its "Calendario" from it.
 *
 * No capability gate: dates are readable by every session, who serves follows
 * the servicio's RLS, and every write goes through the database functions. A
 * node that is not a Dream Team equipo (a Grupos de Vida node) serves no
 * dated shift.
 */
import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { esUuid } from '@/lib/platform/dream-team/alta-persona'
import { isDreamTeamEnabled, requireDreamTeamSession } from '@/lib/platform/dream-team/route-access'
import {
  fetchFechasDeTurnos,
  fetchTurnos,
  fetchTurnosDisponibles,
  puedeGestionarTurno,
} from '@/lib/platform/dream-team/turnos'

export async function GET(req: NextRequest) {
  try {
    if (!isDreamTeamEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const session = await requireDreamTeamSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const equipoId = req.nextUrl.searchParams.get('equipoId') ?? ''
    if (!esUuid(equipoId)) return NextResponse.json({ turnos: [] })

    const supabase = await createSupabaseServerClient()
    const porFechas = (await fetchTurnos(supabase)).filter((turno) => turno.activo && turno.tipo === 'fechas')
    if (porFechas.length === 0) return NextResponse.json({ turnos: [] })

    const disponibles = new Set(await fetchTurnosDisponibles(supabase, equipoId, porFechas))
    const delEquipo = porFechas.filter((turno) => disponibles.has(turno.id))
    if (delEquipo.length === 0) return NextResponse.json({ turnos: [] })

    const [fechas, permisos] = await Promise.all([
      fetchFechasDeTurnos(
        supabase,
        delEquipo.map((turno) => turno.id),
      ),
      Promise.all(delEquipo.map((turno) => puedeGestionarTurno(supabase, turno.id))),
    ])
    return NextResponse.json({
      turnos: delEquipo.map((turno, indice) => ({
        id: turno.id,
        nombre: turno.nombre,
        hora: turno.hora,
        puedeGestionar: permisos[indice],
        fechas: fechas.filter((fecha) => fecha.turnoId === turno.id),
      })),
    })
  } catch (error) {
    console.error('[dream-team/turnos/calendario] GET error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
