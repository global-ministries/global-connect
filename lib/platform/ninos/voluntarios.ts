/**
 * Volunteer attendance in Niños (odd/tasks/ninos-asistencia-voluntarios.md,
 * V3). The server (ninos_voluntarios_planilla / ninos_voluntarios_marcar)
 * decides who may mark whom, who was expected and the marking window; these
 * helpers only pick the service from the URL and shape the roster rows for
 * the screen.
 */
import { resolverServicio, type Servicio, type TurnoFila } from './checkin'

export type EstadoAsistencia = 'presente' | 'justificado' | 'ausente'

/** The three buttons of a row, in screen order. */
export const ESTADOS_ASISTENCIA: readonly EstadoAsistencia[] = ['presente', 'justificado', 'ausente']

export const ETIQUETA_ESTADO: Record<EstadoAsistencia, string> = {
  presente: 'Presente',
  justificado: 'Avisó',
  ausente: 'Faltó',
}

/** A row of ninos_voluntarios_turnos. */
export type TurnoVoluntarios = TurnoFila & { dia_semana: number; campus_id: string; campus: string }

/** A row of the roster: one active servicio the caller may mark. */
export interface FilaVoluntario {
  servicio_id: string
  nombre: string
  apellido: string | null
  area_id: string
  area: string
  equipo_id: string
  equipo: string
  rol: string
  /** Assigned to this service and due that date (A/B frequency). */
  esperado: boolean
  /** No service assigned at all. */
  sin_turno: boolean
  /** The current mark; null = "sin marcar". */
  estado: EstadoAsistencia | null
}

export interface AreaVoluntarios {
  id: string
  nombre: string
}

export interface Planilla {
  turno: string
  fecha: string
  /** Inside the marking window (today or up to 14 days back). */
  editable: boolean
  areas: AreaVoluntarios[]
  voluntarios: FilaVoluntario[]
}

export interface Contadores {
  esperados: number
  /** Everyone marked Presente, extras included. */
  presentes: number
  avisos: number
  faltas: number
  /** Expected volunteers nobody marked yet. */
  sinMarcar: number
  /** Present without being expected (substitutes, no turno). */
  extras: number
}

export interface GrupoEquipo {
  equipoId: string
  equipo: string
  filas: FilaVoluntario[]
}

const ES = 'es'

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

function diaDeSemana(fecha: string): number {
  return new Date(`${fecha}T00:00:00Z`).getUTCDay()
}

/** The last date up to `hoy` (YYYY-MM-DD, Caracas) on that weekday (0 = Sunday). */
export function ultimaFechaDeServicio(hoy: string, diaSemana: number): string {
  return sumarDias(hoy, -((diaDeSemana(hoy) - diaSemana + 7) % 7))
}

/**
 * The service from the query (?turno=&fecha=). The turno falls back like
 * check-in (resolverServicio); the date falls back to the last day of that
 * service, never a future one: attendance is marked after the fact.
 */
export function resolverServicioVoluntarios(
  query: { turno?: string; fecha?: string },
  turnos: readonly TurnoVoluntarios[],
  hoy: string,
): Servicio {
  const base = resolverServicio(query, turnos, hoy)
  if (query.fecha && base.fecha === query.fecha) return base
  const turno = turnos.find((t) => t.id === base.turnoId)
  return { turnoId: base.turnoId, fecha: ultimaFechaDeServicio(hoy, turno?.dia_semana ?? 0) }
}

/** After picking another service: a date on another weekday moves to that service's last day. */
export function ajustarFecha(servicio: Servicio, turnos: readonly TurnoVoluntarios[], hoy: string): Servicio {
  const turno = turnos.find((t) => t.id === servicio.turnoId)
  if (!turno || diaDeSemana(servicio.fecha) === turno.dia_semana) return servicio
  return { ...servicio, fecha: ultimaFechaDeServicio(hoy, turno.dia_semana) }
}

function lista(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object') : []
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function estado(v: unknown): EstadoAsistencia | null {
  return ESTADOS_ASISTENCIA.includes(v as EstadoAsistencia) ? (v as EstadoAsistencia) : null
}

/** Reads ninos_voluntarios_turnos; with several campuses the campus prefixes each name. */
export function leerTurnosVoluntarios(data: unknown): TurnoVoluntarios[] {
  const filas = lista(data).map((t) => ({
    id: texto(t.id),
    nombre: texto(t.nombre),
    hora: texto(t.hora),
    orden: Number(t.orden) || 0,
    dia_semana: Number(t.dia_semana) || 0,
    campus_id: texto(t.campus_id),
    campus: texto(t.campus),
  }))
  if (new Set(filas.map((t) => t.campus_id)).size < 2) return filas
  return filas.map((t) => ({ ...t, nombre: `${t.campus} · ${t.nombre}` }))
}

/** Reads the jsonb of ninos_voluntarios_planilla defensively. */
export function leerPlanilla(data: unknown): Planilla {
  const o = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  return {
    turno: texto(o.turno),
    fecha: texto(o.fecha),
    editable: o.editable === true,
    areas: lista(o.areas).map((a) => ({ id: texto(a.id), nombre: texto(a.nombre) })),
    voluntarios: lista(o.voluntarios).map((v) => ({
      servicio_id: texto(v.servicio_id),
      nombre: texto(v.nombre),
      apellido: typeof v.apellido === 'string' ? v.apellido : null,
      area_id: texto(v.area_id),
      area: texto(v.area),
      equipo_id: texto(v.equipo_id),
      equipo: texto(v.equipo),
      rol: texto(v.rol),
      esperado: v.esperado === true,
      sin_turno: v.sin_turno === true,
      estado: estado(v.estado),
    })),
  }
}

export function nombreCompleto(f: Pick<FilaVoluntario, 'nombre' | 'apellido'>): string {
  return [f.nombre, f.apellido].filter(Boolean).join(' ')
}

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Every word of `busqueda` must appear in the name (case and accents ignored). */
export function filtrarPorNombre(filas: readonly FilaVoluntario[], busqueda: string): readonly FilaVoluntario[] {
  const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return filas
  return filas.filter((f) => {
    const nombre = normalizar(nombreCompleto(f))
    return palabras.every((p) => nombre.includes(p))
  })
}

export function contarPlanilla(filas: readonly FilaVoluntario[]): Contadores {
  const c: Contadores = { esperados: 0, presentes: 0, avisos: 0, faltas: 0, sinMarcar: 0, extras: 0 }
  for (const f of filas) {
    if (f.esperado) c.esperados++
    if (f.estado === 'presente') c.presentes++
    if (f.estado === 'justificado') c.avisos++
    if (f.estado === 'ausente') c.faltas++
    if (f.esperado && f.estado === null) c.sinMarcar++
    if (!f.esperado && f.estado === 'presente') c.extras++
  }
  return c
}

/** Expected volunteers, the others assigned to some service, and those with none. */
export function separarPlanilla(filas: readonly FilaVoluntario[]): {
  esperados: FilaVoluntario[]
  otros: FilaVoluntario[]
  sinTurno: FilaVoluntario[]
} {
  return {
    esperados: filas.filter((f) => f.esperado),
    otros: filas.filter((f) => !f.esperado && !f.sin_turno),
    sinTurno: filas.filter((f) => !f.esperado && f.sin_turno),
  }
}

/** One group per equipo, groups and names in Spanish alphabetical order. */
export function agruparPorEquipo(filas: readonly FilaVoluntario[]): GrupoEquipo[] {
  const grupos = new Map<string, GrupoEquipo>()
  for (const f of filas) {
    const g = grupos.get(f.equipo_id) ?? { equipoId: f.equipo_id, equipo: f.equipo, filas: [] }
    g.filas.push(f)
    grupos.set(f.equipo_id, g)
  }
  return [...grupos.values()]
    .sort((a, b) => a.equipo.localeCompare(b.equipo, ES))
    .map((g) => ({ ...g, filas: [...g.filas].sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b), ES)) }))
}

/** The expected volunteers still unmarked: what "Marcar el resto como Faltó" sends. */
export function pendientesDeEquipo(filas: readonly FilaVoluntario[]): string[] {
  return filas.filter((f) => f.esperado && f.estado === null).map((f) => f.servicio_id)
}

/** Tapping the active button clears the mark. */
export function siguienteEstado(actual: EstadoAsistencia | null, pulsado: EstadoAsistencia): EstadoAsistencia | null {
  return actual === pulsado ? null : pulsado
}

/** The rows with the estados of `cambios` (servicio_id → estado) applied. */
export function aplicarCambios(
  filas: readonly FilaVoluntario[],
  cambios: ReadonlyMap<string, EstadoAsistencia | null>,
): FilaVoluntario[] {
  return filas.map((f) => (cambios.has(f.servicio_id) ? { ...f, estado: cambios.get(f.servicio_id) ?? null } : f))
}

type ErrorRpc = { code?: string; message?: string } | null

export function mensajeErrorPlanilla(error: ErrorRpc): string {
  const m = error?.message ?? ''
  if (m.includes('fecha_invalida')) return 'Esa fecha no es día de este servicio. Elige otra fecha.'
  if (m.includes('sin_autoridad')) return 'No tienes voluntarios para marcar en este servicio.'
  if (m.includes('turno_invalido')) return 'Ese servicio ya no está activo.'
  return 'No se pudo cargar la lista de voluntarios.'
}

export function mensajeErrorMarcar(error: ErrorRpc): string {
  const m = error?.message ?? ''
  if (m.includes('fecha_invalida')) return 'Solo se puede marcar el día del servicio, hoy o hasta 14 días atrás.'
  if (m.includes('sin_autoridad')) return 'No tienes permiso para marcar a este voluntario.'
  if (m.includes('servicio_invalido')) return 'Ese voluntario ya no está en la lista de este servicio. Actualiza la página.'
  return 'No se pudo guardar la asistencia. Intenta de nuevo.'
}

export function urlVoluntarios(servicio: Servicio, areaId: string | null): string {
  const q = new URLSearchParams()
  if (servicio.turnoId) q.set('turno', servicio.turnoId)
  q.set('fecha', servicio.fecha)
  if (areaId) q.set('area', areaId)
  return `/ninos/voluntarios?${q.toString()}`
}
