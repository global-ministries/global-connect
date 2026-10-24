/**
 * Volunteer attendance report (odd/tasks/ninos-asistencia-voluntarios.md, V5).
 * Every count comes from ninos_reporte_voluntarios; these helpers only read
 * its jsonb defensively, add rows up for the screen and build the CSV files.
 */

/** One service (fecha + turno) of one equipo. */
export interface FilaServicioVoluntarios {
  fecha: string
  turno_id: string
  turno: string
  turno_orden: number
  area_id: string
  area: string
  equipo_id: string
  equipo: string
  esperados: number
  presentes: number
  avisos: number
  faltas: number
  sin_marcar: number
  extras: number
}

/** Totals of one volunteer over the range. */
export interface FilaVoluntarioReporte {
  servicio_id: string
  nombre: string
  area: string
  equipo: string
  rol: string
  esperados: number
  presentes: number
  avisos: number
  faltas: number
  sin_marcar: number
  extras: number
  /** Consecutive Faltó on their latest expected services. */
  faltas_seguidas: number
}

export interface ReporteVoluntarios {
  servicios: FilaServicioVoluntarios[]
  voluntarios: FilaVoluntarioReporte[]
}

export interface Conteo {
  esperados: number
  presentes: number
  avisos: number
  faltas: number
  sinMarcar: number
  extras: number
}

export interface ResumenServicio extends Conteo {
  fecha: string
  turno: string
}

export interface ResumenEquipo extends Conteo {
  area: string
  equipo: string
}

/** From this many consecutive misses a volunteer needs a call. */
export const FALTAS_SEGUIDAS_ALERTA = 2

function lista(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object') : []
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function numero(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Reads the jsonb of ninos_reporte_voluntarios defensively. */
export function leerReporteVoluntarios(data: unknown): ReporteVoluntarios {
  const o = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  return {
    servicios: lista(o.servicios).map((s) => ({
      fecha: texto(s.fecha),
      turno_id: texto(s.turno_id),
      turno: texto(s.turno),
      turno_orden: numero(s.turno_orden),
      area_id: texto(s.area_id),
      area: texto(s.area),
      equipo_id: texto(s.equipo_id),
      equipo: texto(s.equipo),
      esperados: numero(s.esperados),
      presentes: numero(s.presentes),
      avisos: numero(s.avisos),
      faltas: numero(s.faltas),
      sin_marcar: numero(s.sin_marcar),
      extras: numero(s.extras),
    })),
    voluntarios: lista(o.voluntarios).map((v) => ({
      servicio_id: texto(v.servicio_id),
      nombre: texto(v.nombre),
      area: texto(v.area),
      equipo: texto(v.equipo),
      rol: texto(v.rol),
      esperados: numero(v.esperados),
      presentes: numero(v.presentes),
      avisos: numero(v.avisos),
      faltas: numero(v.faltas),
      sin_marcar: numero(v.sin_marcar),
      extras: numero(v.extras),
      faltas_seguidas: numero(v.faltas_seguidas),
    })),
  }
}

function vacio(): Conteo {
  return { esperados: 0, presentes: 0, avisos: 0, faltas: 0, sinMarcar: 0, extras: 0 }
}

function sumar(c: Conteo, f: FilaServicioVoluntarios): void {
  c.esperados += f.esperados
  c.presentes += f.presentes
  c.avisos += f.avisos
  c.faltas += f.faltas
  c.sinMarcar += f.sin_marcar
  c.extras += f.extras
}

/** Every row added up. */
export function totalVoluntarios(filas: readonly FilaServicioVoluntarios[]): Conteo {
  const c = vacio()
  for (const f of filas) sumar(c, f)
  return c
}

/**
 * Share of the expected volunteers who came, rounded; extras do not count
 * (they were not expected). Null when nobody was expected.
 */
export function porcentajeAsistencia(c: Conteo): number | null {
  if (c.esperados === 0) return null
  return Math.round(((c.presentes - c.extras) / c.esperados) * 100)
}

/** One row per fecha and turno (every equipo added up), oldest first. */
export function resumenPorServicio(filas: readonly FilaServicioVoluntarios[]): ResumenServicio[] {
  const grupos = new Map<string, ResumenServicio & { orden: number }>()
  for (const f of filas) {
    const clave = `${f.fecha}|${f.turno_id}`
    const g = grupos.get(clave) ?? { fecha: f.fecha, turno: f.turno, orden: f.turno_orden, ...vacio() }
    sumar(g, f)
    grupos.set(clave, g)
  }
  return [...grupos.values()]
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden)
    .map(({ orden: _orden, ...r }) => r)
}

/** One row per area and equipo over the whole range, alphabetical. */
export function resumenPorEquipo(filas: readonly FilaServicioVoluntarios[]): ResumenEquipo[] {
  const grupos = new Map<string, ResumenEquipo>()
  for (const f of filas) {
    const g = grupos.get(f.equipo_id) ?? { area: f.area, equipo: f.equipo, ...vacio() }
    sumar(g, f)
    grupos.set(f.equipo_id, g)
  }
  return [...grupos.values()].sort((a, b) => a.area.localeCompare(b.area, 'es') || a.equipo.localeCompare(b.equipo, 'es'))
}

/** Volunteers to call: FALTAS_SEGUIDAS_ALERTA or more misses in a row (server order). */
export function conFaltasSeguidas(voluntarios: readonly FilaVoluntarioReporte[]): FilaVoluntarioReporte[] {
  return voluntarios.filter((v) => v.faltas_seguidas >= FALTAS_SEGUIDAS_ALERTA)
}

function celda(valor: string | number): string {
  let v = String(valor)
  let citar = /[",\r\n]/.test(v)
  // Spreadsheet formula injection: prefix and quote.
  if (/^[=+\-@\t]/.test(v)) {
    v = `'${v}`
    citar = true
  }
  return citar ? `"${v.replace(/"/g, '""')}"` : v
}

function csv(cabecera: readonly string[], filas: readonly (readonly (string | number)[])[]): string {
  return [cabecera.join(','), ...filas.map((f) => f.map(celda).join(','))].join('\r\n')
}

/** CSV per service and equipo (comma separated, CRLF). */
export function csvServiciosVoluntarios(filas: readonly FilaServicioVoluntarios[]): string {
  return csv(
    ['Fecha', 'Servicio', 'Área', 'Equipo', 'Esperados', 'Presentes', 'Avisó', 'Faltó', 'Sin marcar', 'Extras'],
    filas.map((f) => [f.fecha, f.turno, f.area, f.equipo, f.esperados, f.presentes, f.avisos, f.faltas, f.sin_marcar, f.extras]),
  )
}

/** CSV per volunteer (comma separated, CRLF). */
export function csvVoluntarios(voluntarios: readonly FilaVoluntarioReporte[]): string {
  return csv(
    ['Voluntario', 'Área', 'Equipo', 'Rol', 'Esperado', 'Presente', 'Avisó', 'Faltó', 'Sin marcar', 'Extras', 'Faltas seguidas'],
    voluntarios.map((v) => [
      v.nombre,
      v.area,
      v.equipo,
      v.rol,
      v.esperados,
      v.presentes,
      v.avisos,
      v.faltas,
      v.sin_marcar,
      v.extras,
      v.faltas_seguidas,
    ]),
  )
}

export type PestanaReportes = 'ninos' | 'voluntarios'

/**
 * The reports URL of a tab, keeping the shared filters. The tab travels in
 * `reporte` (not `vista`, which the children's report uses for its own view).
 */
export function urlPestanaReportes(
  pestana: PestanaReportes,
  filtros: { desde?: string; hasta?: string; campusId?: string; turnoId?: string },
): string {
  const q = new URLSearchParams()
  if (filtros.desde) q.set('desde', filtros.desde)
  if (filtros.hasta) q.set('hasta', filtros.hasta)
  if (filtros.campusId) q.set('campus', filtros.campusId)
  if (filtros.turnoId) q.set('turno', filtros.turnoId)
  if (pestana === 'voluntarios') q.set('reporte', 'voluntarios')
  const s = q.toString()
  return s ? `/ninos/reportes?${s}` : '/ninos/reportes'
}
