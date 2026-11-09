/**
 * The turnos of a Niños service for /ninos/checkin and /ninos/salon
 * (odd/tasks/ninos-checkin-pco.md, T1b, S8.1). The campus's active Sunday
 * weekly turnos are read exactly as before; on top, the active dated turnos
 * ('fechas') that an active horario of an active Niños event links, on the
 * service date when one of their planned dates (dream_team_turno_fechas) is
 * that day. Their hour is the date's hora when set, else the turno's (S8.2).
 *
 * RLS: ninos_evento_horarios / ninos_eventos are readable by whoever operates
 * Niños in the campus (ninos_puede_operar_campus); dream_team_turno_fechas by
 * any authenticated user. A viewer who does not operate (a Líder on
 * /ninos/salon) sees no horario, so only the Sunday turnos.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { esFechaValida, type TurnoFila } from './checkin'
import { fechaServicioPorDefecto } from './fecha'

/** A planned date of a dated turno. */
export type FechaDeTurno = {
  fecha: string
  hora: string | null
  turno: Pick<TurnoFila, 'id' | 'nombre' | 'hora' | 'orden'>
}

/**
 * The service date: the URL's when valid; else today when a Niños event
 * happens today; else today if Sunday or the coming Sunday, as before.
 */
export function fechaDelServicio(query: string | undefined, hoy: string, fechasConEvento: readonly string[]): string {
  if (esFechaValida(query)) return query
  return fechasConEvento.includes(hoy) ? hoy : fechaServicioPorDefecto(hoy)
}

/** The Sunday turnos as they came, then the dated turnos planned on `fecha`. */
export function turnosDelServicio(semanales: readonly TurnoFila[], fechados: readonly FechaDeTurno[], fecha: string): TurnoFila[] {
  const delDia = fechados
    .filter((f) => f.fecha === fecha)
    .map(({ hora, turno }) => ({ id: turno.id, nombre: turno.nombre, hora: hora ?? turno.hora, orden: turno.orden, tipo: 'fechas' as const }))
    .sort((a, b) => a.orden - b.orden || a.hora.localeCompare(b.hora))
  return [...semanales, ...delDia]
}

type Fila = Record<string, unknown>

function filas(data: unknown): Fila[] {
  return Array.isArray(data) ? data.filter((x): x is Fila => Boolean(x) && typeof x === 'object') : []
}

function leerFechaDeTurno(f: Fila): FechaDeTurno | null {
  const t = f.turno as Fila | null
  if (!t || typeof t.id !== 'string' || typeof f.fecha !== 'string') return null
  return {
    fecha: f.fecha,
    hora: typeof f.hora === 'string' ? f.hora : null,
    turno: { id: t.id, nombre: String(t.nombre ?? ''), hora: String(t.hora ?? ''), orden: Number(t.orden) || 0 },
  }
}

/**
 * Reads the turnos of the service for the campuses and resolves its date.
 * ninos_eventos is not in the generated types yet, so the client is untyped.
 */
export async function cargarTurnosDelServicio(
  supabase: SupabaseClient,
  campus: readonly string[],
  queryFecha: string | undefined,
  hoy: string,
): Promise<{ turnos: TurnoFila[]; fecha: string }> {
  if (campus.length === 0) return { turnos: [], fecha: fechaDelServicio(queryFecha, hoy, []) }
  // Without a date in the URL, today's event wins over the coming Sunday.
  const desde = esFechaValida(queryFecha) ? queryFecha : hoy
  const hasta = esFechaValida(queryFecha) ? queryFecha : fechaServicioPorDefecto(hoy)

  const [{ data: semanales }, { data: planificadas }] = await Promise.all([
    supabase
      .from('dream_team_turnos')
      .select('id, nombre, hora, orden')
      .in('campus_id', campus)
      .eq('activo', true)
      .eq('dia_semana', 0)
      // Other ministries' dated shifts (The Living Room) never reach Niños; its own events come below.
      .eq('tipo', 'semanal')
      .order('orden'),
    supabase
      .from('dream_team_turno_fechas')
      .select('fecha, hora, turno:dream_team_turnos!inner(id, nombre, hora, orden, campus_id, activo, tipo)')
      .in('turno.campus_id', campus)
      .eq('turno.activo', true)
      .eq('turno.tipo', 'fechas')
      .gte('fecha', desde)
      .lte('fecha', hasta),
  ])

  let fechados = filas(planificadas)
    .map(leerFechaDeTurno)
    .filter((f): f is FechaDeTurno => f !== null)
  if (fechados.length > 0) {
    const { data: horarios } = await supabase
      .from('ninos_evento_horarios')
      .select('turno_id, evento:ninos_eventos!inner(activo)')
      .in('turno_id', [...new Set(fechados.map((f) => f.turno.id))])
      .eq('activo', true)
      .eq('evento.activo', true)
    const deNinos = new Set(filas(horarios).map((h) => h.turno_id))
    fechados = fechados.filter((f) => deNinos.has(f.turno.id))
  }

  const fecha = fechaDelServicio(queryFecha, hoy, fechados.map((f) => f.fecha))
  return { turnos: turnosDelServicio((semanales ?? []) as TurnoFila[], fechados, fecha), fecha }
}
