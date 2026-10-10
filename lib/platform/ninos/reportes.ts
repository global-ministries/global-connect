/**
 * Niños attendance reports (odd/tasks/ninos-checkin.md, N7 and N16). The
 * server (ninos_reporte_asistencia) does every aggregation over check-ins,
 * including every count of distinct children per day, month, range, service
 * and area. These helpers only read and shape its rows for the page and the
 * CSV export: they never add rows up to get a number of children.
 */

export type AreaNinos = 'waumba' | 'upstreet'

/** Areas in the order the page shows them. */
export const AREAS: readonly AreaNinos[] = ['waumba', 'upstreet']

export const NOMBRE_AREA: Record<AreaNinos, string> = { waumba: 'Waumba Land', upstreet: 'UpStreet' }

export interface FilaSalonReporte {
  fecha: string
  turno_id: string
  turno: string
  turno_orden: number
  salon_id: string
  salon: string
  salon_orden: number
  area: AreaNinos
  capacidad: number
  /** Distinct children checked in to the room in that service. */
  ninos: number
  checkins: number
  /** Most children present at the same time. */
  pico: number
}

export interface ConteoTurno {
  turno_id: string
  turno: string
  turno_orden: number
  /** Distinct children in that service. */
  ninos: number
  checkins: number
}

export interface ConteoArea {
  area: AreaNinos
  /** Distinct children in that area. */
  ninos: number
  checkins: number
}

/** Distinct children of a period, overall, per service and per area. */
export interface ConteosPeriodo {
  ninos: number
  checkins: number
  turnos: ConteoTurno[]
  areas: ConteoArea[]
}

export interface DiaReporte extends ConteosPeriodo {
  fecha: string
}

export interface ResumenPeriodo extends ConteosPeriodo {
  /** Service days: dates with check-ins. */
  dias: number
  /** Average of the distinct children per service day; null without service days. */
  promedio: number | null
  nuevos: number
  familias_nuevas: number
}

export interface MesReporte extends ResumenPeriodo {
  /** First day of the month, YYYY-MM-01. */
  mes: string
  /** The part of the month inside the range. */
  desde: string
  hasta: string
  /** The range does not cover the whole month. */
  parcial: boolean
}

/**
 * volvio: came back on a later date; no_volvio: services happened since and
 * the child did not come; pendiente: no service has happened since the first
 * visit.
 */
export type EstadoRetorno = 'volvio' | 'no_volvio' | 'pendiente'

export interface NinoNuevo {
  nino_id: string
  nombre: string
  fecha: string
  salon: string
  visita_id: string
  padres: string[]
  estado: EstadoRetorno
  /** The family (the first visit) came back when any of its new children did. */
  estado_familia: EstadoRetorno
  /** Distinct dates attended so far. */
  visitas: number
  ultima_fecha: string
}

export interface NinoAusente {
  nino_id: string
  nombre: string
  ultima_fecha: string
  salon: string
  /** Sundays attended out of the 4 before the last two. */
  veces: number
  padres: string[]
}

export interface Reporte {
  domingo_referencia: string | null
  salones: FilaSalonReporte[]
  dias: DiaReporte[]
  meses: MesReporte[]
  totales: ResumenPeriodo
  nuevos: NinoNuevo[]
  ausentes: NinoAusente[]
}

export type VistaAsistencia = 'domingo' | 'mes'

const SEMANAS_POR_DEFECTO = 8
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** The last 8 Sundays, ending on the last Sunday up to `hoy` (YYYY-MM-DD, Caracas). */
export function rangoPorDefecto(hoy: string): { desde: string; hasta: string } {
  const dow = new Date(`${hoy}T00:00:00Z`).getUTCDay()
  const hasta = sumarDias(hoy, -dow)
  return { desde: sumarDias(hasta, -7 * (SEMANAS_POR_DEFECTO - 1)), hasta }
}

/** First and last day of the month `desplazamiento` months away from the month of `hoy`. */
function limitesMes(hoy: string, desplazamiento: number): { desde: string; hasta: string } {
  const [anio, mes] = hoy.split('-').map(Number)
  const desde = new Date(Date.UTC(anio, mes - 1 + desplazamiento, 1))
  const hasta = new Date(Date.UTC(anio, mes + desplazamiento, 0))
  return { desde: desde.toISOString().slice(0, 10), hasta: hasta.toISOString().slice(0, 10) }
}

export type ClaveRango = 'domingos' | 'este-mes' | 'mes-anterior' | 'seis-meses'

export interface RangoRapido {
  clave: ClaveRango
  etiqueta: string
  desde: string
  hasta: string
}

/**
 * Quick ranges from `hoy` (YYYY-MM-DD, Caracas). The current month ends
 * today, so it shows as partial in the monthly view.
 */
export function rangosRapidos(hoy: string): RangoRapido[] {
  return [
    { clave: 'domingos', etiqueta: `Últimos ${SEMANAS_POR_DEFECTO} domingos`, ...rangoPorDefecto(hoy) },
    { clave: 'este-mes', etiqueta: 'Este mes', desde: limitesMes(hoy, 0).desde, hasta: hoy },
    { clave: 'mes-anterior', etiqueta: 'Mes anterior', ...limitesMes(hoy, -1) },
    { clave: 'seis-meses', etiqueta: 'Últimos 6 meses', desde: limitesMes(hoy, -5).desde, hasta: hoy },
  ]
}

function lista<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function conListas<T extends object>(fila: T): T & Pick<ConteosPeriodo, 'turnos' | 'areas'> {
  const o = fila as Record<string, unknown>
  return { ...fila, turnos: lista<ConteoTurno>(o.turnos), areas: lista<ConteoArea>(o.areas) }
}

const ESTADOS: readonly EstadoRetorno[] = ['volvio', 'no_volvio', 'pendiente']

function estadoRetorno(v: unknown): EstadoRetorno {
  return ESTADOS.find((e) => e === v) ?? 'pendiente'
}

const RESUMEN_VACIO: ResumenPeriodo = {
  ninos: 0,
  checkins: 0,
  dias: 0,
  promedio: null,
  nuevos: 0,
  familias_nuevas: 0,
  turnos: [],
  areas: [],
}

/** Reads the RPC's jsonb defensively. */
export function leerReporte(data: unknown): Reporte {
  const o = objeto(data)
  return {
    domingo_referencia: typeof o.domingo_referencia === 'string' ? o.domingo_referencia : null,
    salones: lista<FilaSalonReporte>(o.salones),
    dias: lista<DiaReporte>(o.dias).map(conListas),
    meses: lista<MesReporte>(o.meses).map(conListas),
    totales: conListas({ ...RESUMEN_VACIO, ...(objeto(o.totales) as Partial<ResumenPeriodo>) }),
    nuevos: lista<NinoNuevo>(o.nuevos).map((n) => ({
      ...n,
      estado: estadoRetorno(n.estado),
      estado_familia: estadoRetorno(n.estado_familia ?? n.estado),
    })),
    ausentes: lista<NinoAusente>(o.ausentes),
  }
}

/** Distinct children of one service in a period (0 when nobody came to it). */
export function ninosDeTurno(p: Pick<ConteosPeriodo, 'turnos'>, turnoId: string): number {
  return p.turnos.find((t) => t.turno_id === turnoId)?.ninos ?? 0
}

/** Distinct children of one area in a period (0 when nobody came to it). */
export function ninosDeArea(p: Pick<ConteosPeriodo, 'areas'>, area: AreaNinos): number {
  return p.areas.find((a) => a.area === area)?.ninos ?? 0
}

/** Every service seen in any of the periods, once and in service order: the table columns. */
export function columnasTurno(periodos: readonly Pick<ConteosPeriodo, 'turnos'>[]): { turno_id: string; turno: string }[] {
  const vistos = new Map<string, ConteoTurno>()
  for (const p of periodos) for (const t of p.turnos) if (!vistos.has(t.turno_id)) vistos.set(t.turno_id, t)
  return [...vistos.values()]
    .sort((a, b) => a.turno_orden - b.turno_orden || a.turno.localeCompare(b.turno))
    .map(({ turno_id, turno }) => ({ turno_id, turno }))
}

/** YYYY-MM-DD → DD/MM/YYYY. */
export function fechaCorta(f: string): string {
  const [a, m, d] = f.split('-')
  return `${d}/${m}/${a}`
}

/** YYYY-MM-01 → 'Marzo 2026'. */
export function nombreMes(mes: string): string {
  const [a, m] = mes.split('-')
  return `${MESES[Number(m) - 1] ?? m} ${a}`
}

/** One decimal with a decimal comma; a dash when there were no service days. */
export function formatoPromedio(v: number | null): string {
  if (v === null) return '—'
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',')
}

/** ['Ana', 'Beto', 'Caro'] → 'Ana, Beto y Caro'. */
export function unirNombres(nombres: readonly string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

export interface FamiliaNueva {
  visita_id: string
  fecha: string
  estado: EstadoRetorno
  ninos: NinoNuevo[]
  /** Parents of every child of the family, once each. */
  padres: string[]
}

/**
 * New families grouped by whether they came back. A family is one first visit
 * (siblings share the visita of their check-in); its state comes from the
 * server. Families keep the server's order.
 */
export function familiasPorEstado(nuevos: readonly NinoNuevo[]): Record<EstadoRetorno, FamiliaNueva[]> {
  const familias = new Map<string, FamiliaNueva>()
  for (const n of nuevos) {
    const f = familias.get(n.visita_id) ?? { visita_id: n.visita_id, fecha: n.fecha, estado: n.estado_familia, ninos: [], padres: [] }
    f.ninos.push(n)
    for (const p of n.padres) if (!f.padres.includes(p)) f.padres.push(p)
    familias.set(n.visita_id, f)
  }
  const grupos: Record<EstadoRetorno, FamiliaNueva[]> = { volvio: [], no_volvio: [], pendiente: [] }
  for (const f of familias.values()) grupos[f.estado].push(f)
  return grupos
}

/** Peak as a percentage of capacity, rounded. */
export function usoPico(f: Pick<FilaSalonReporte, 'pico' | 'capacidad'>): number {
  return f.capacidad > 0 ? Math.round((f.pico / f.capacidad) * 100) : 0
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

/** CSV of the per-room table (comma separated, CRLF). */
export function csvSalones(filas: readonly FilaSalonReporte[]): string {
  const cabecera = ['Fecha', 'Servicio', 'Área', 'Salón', 'Niños', 'Pico', 'Capacidad', 'Uso del pico (%)']
  const cuerpo = filas.map((f) =>
    [f.fecha, f.turno, NOMBRE_AREA[f.area] ?? f.area, f.salon, f.ninos, f.pico, f.capacidad, usoPico(f)].map(celda).join(','),
  )
  return [cabecera.join(','), ...cuerpo].join('\r\n')
}
