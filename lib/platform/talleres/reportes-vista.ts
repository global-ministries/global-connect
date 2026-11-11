/**
 * R3g (odd/tasks/talleres-rediseno.md, S1/S2/S4) — the pure rules of
 * /talleres/reportes, artboard design/talleres-interior/25-reportes-
 * escritorio.html: the quick ranges, which ediciones fall in a range, the
 * per-taller roll-up, the attention pills of each tab and the URL.
 *
 * Client-safe: no I/O. The rows come from reportes.ts (server), which only
 * composes loaders that already existed. What the artboard shows and these
 * loaders cannot provide (asistencia promedio, aprobadas, abandono,
 * tendencia, ámbito, facilitador of each grupo, Exportar) is left out.
 */

export type ClaveRango = 'anio' | '6m' | 'anterior'
export type VistaReportes = 'talleres' | 'ediciones' | 'grupos'
export type FiltroReportes = 'sin-cerrar' | 'sin-enviar' | 'reabiertos'

export interface RangoReporteTalleres {
  readonly clave: ClaveRango
  readonly etiqueta: string
  /** YYYY-MM-DD, inclusive. */
  readonly desde: string
  readonly hasta: string
}

export type EstadoEdicionReporte = 'abierto' | 'en_curso' | 'cerrado' | 'borrador' | 'cancelado'

export interface EdicionReporte {
  readonly id: string
  readonly tallerId: string
  readonly tallerNombre: string
  readonly tallerSlug: string | null
  readonly nombre: string
  readonly estado: EstadoEdicionReporte
  /** YYYY-MM-DD; the cohorte's start when the edición has no dates of its own. */
  readonly fechaInicio: string | null
  readonly fechaFin: string | null
  /** When a director closed it (results computed); null otherwise. */
  readonly cerradaEn: string | null
  /** Every inscripción of the edición, whatever its estado. */
  readonly inscripciones: number
  readonly certificados: number
  /** Inscripciones with unit_estado = completado; null while none has a final result. */
  readonly completaron: number | null
  /** Inscripciones with a final result (completado, no completado, abandono). */
  readonly conResultado: number
}

export type EstadoReporteGrupo = 'borrador' | 'enviado' | 'reabierto' | 'cerrado'

export interface ReporteGrupo {
  readonly id: string
  readonly grupoId: string
  readonly grupoNombre: string | null
  readonly estado: EstadoReporteGrupo
  readonly firmaLiderFecha: string | null
  readonly reabiertoMotivo: string | null
  readonly tallerNombre: string | null
  readonly edicionId: string | null
}

export interface TallerReporte {
  /** talleres.id. */
  readonly clave: string
  readonly nombre: string
  readonly slug: string | null
  /** Its ediciones in the range, newest first. */
  readonly ediciones: readonly EdicionReporte[]
  readonly inscripciones: number
  /** null while none of its ediciones has results. */
  readonly completaron: number | null
  readonly certificados: number
}

export interface TotalesReporte {
  readonly talleres: number
  readonly ediciones: number
  readonly inscripciones: number
  readonly completaron: number | null
  readonly certificados: number
}

export interface DatosReportes {
  readonly ediciones: readonly EdicionReporte[]
  readonly talleres: readonly TallerReporte[]
  readonly grupos: readonly ReporteGrupo[]
  /** Ediciones that have no date at all: they fall in no range. */
  readonly sinFechas: number
  readonly totales: TotalesReporte
}

export interface PastillaReporte {
  readonly id: FiltroReportes
  readonly etiqueta: string
  readonly cantidad: number
}

export interface ConsultaReportes {
  readonly vista: VistaReportes
  readonly rango: ClaveRango
  readonly filtro: FiltroReportes | null
}

export const CONSULTA_POR_DEFECTO: ConsultaReportes = { vista: 'talleres', rango: 'anio', filtro: null }

const VISTAS: readonly VistaReportes[] = ['talleres', 'ediciones', 'grupos']
const RANGOS: readonly ClaveRango[] = ['anio', '6m', 'anterior']
const FILTROS: readonly FiltroReportes[] = ['sin-cerrar', 'sin-enviar', 'reabiertos']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const dos = (n: number): string => String(n).padStart(2, '0')

function partes(iso: string): { anio: number; mes: number; dia: number } {
  const [anio, mes, dia] = iso.slice(0, 10).split('-').map(Number)
  return { anio, mes, dia }
}

/** `hoy` minus `meses` months, clamped to the last day of the target month. */
function restarMeses(hoy: string, meses: number): string {
  const { anio, mes, dia } = partes(hoy)
  const total = anio * 12 + (mes - 1) - meses
  const a = Math.floor(total / 12)
  const m = (total % 12) + 1
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return `${a}-${dos(m)}-${dos(Math.min(dia, ultimo))}`
}

/** Este año · Últimos 6 meses · the previous year (artboard 25's range popover). */
export function rangosReportesTalleres(hoy: string): readonly RangoReporteTalleres[] {
  const { anio } = partes(hoy)
  return [
    { clave: 'anio', etiqueta: 'Este año', desde: `${anio}-01-01`, hasta: hoy },
    { clave: '6m', etiqueta: 'Últimos 6 meses', desde: restarMeses(hoy, 6), hasta: hoy },
    { clave: 'anterior', etiqueta: String(anio - 1), desde: `${anio - 1}-01-01`, hasta: `${anio - 1}-12-31` },
  ]
}

/** "12 oct 2026". */
export function fechaCorta(iso: string): string {
  const { anio, mes, dia } = partes(iso)
  return `${dia} ${MESES[mes - 1]} ${anio}`
}

/** "1 ene – 11 nov 2026", or both years when they differ. */
export function fechasRango(desde: string, hasta: string): string {
  const a = partes(desde)
  const b = partes(hasta)
  const inicio = a.anio === b.anio ? `${a.dia} ${MESES[a.mes - 1]}` : fechaCorta(desde)
  return `${inicio} – ${fechaCorta(hasta)}`
}

/** The edición's dates as one line, or null when it has none. */
export function fechasEdicion(e: Pick<EdicionReporte, 'fechaInicio' | 'fechaFin'>): string | null {
  if (!e.fechaInicio) return null
  if (!e.fechaFin || e.fechaFin.slice(0, 10) === e.fechaInicio.slice(0, 10)) return fechaCorta(e.fechaInicio)
  return fechasRango(e.fechaInicio, e.fechaFin)
}

/** A date-derived «Cerrada» whose results a director has not computed yet. */
export function terminadaSinCerrar(e: Pick<EdicionReporte, 'estado' | 'cerradaEn'>): boolean {
  return e.estado === 'cerrado' && e.cerradaEn === null
}

export function esReabierto(g: Pick<ReporteGrupo, 'estado' | 'reabiertoMotivo'>): boolean {
  return g.estado === 'reabierto' || g.reabiertoMotivo !== null
}

/** true / false, or null when the edición has no date to place it. */
function enRango(e: EdicionReporte, rango: RangoReporteTalleres): boolean | null {
  if (!e.fechaInicio) return null
  const inicio = e.fechaInicio.slice(0, 10)
  const fin = (e.fechaFin ?? e.fechaInicio).slice(0, 10)
  return inicio <= rango.hasta && fin >= rango.desde
}

const sumaONull = (valores: readonly (number | null)[]): number | null =>
  valores.some((v) => v !== null) ? valores.reduce<number>((s, v) => s + (v ?? 0), 0) : null

function porInicioDesc(a: EdicionReporte, b: EdicionReporte): number {
  const fa = a.fechaInicio ?? ''
  const fb = b.fechaInicio ?? ''
  if (fa !== fb) return fa < fb ? 1 : -1
  return a.tallerNombre.localeCompare(b.tallerNombre, 'es')
}

export function calcularReportesTalleres({
  ediciones,
  grupos,
  rango,
}: {
  readonly ediciones: readonly EdicionReporte[]
  readonly grupos: readonly ReporteGrupo[]
  readonly rango: RangoReporteTalleres
}): DatosReportes {
  const dentro: EdicionReporte[] = []
  const fuera = new Set<string>()
  let sinFechas = 0
  for (const e of ediciones) {
    const r = enRango(e, rango)
    if (r === null) sinFechas += 1
    else if (r) dentro.push(e)
    else fuera.add(e.id)
  }
  dentro.sort(porInicioDesc)

  const porTaller = new Map<string, EdicionReporte[]>()
  for (const e of dentro) porTaller.set(e.tallerId, [...(porTaller.get(e.tallerId) ?? []), e])
  const talleres: TallerReporte[] = Array.from(porTaller.entries()).map(([clave, eds]) => ({
    clave,
    nombre: eds[0].tallerNombre,
    slug: eds[0].tallerSlug,
    ediciones: eds,
    inscripciones: eds.reduce((s, e) => s + e.inscripciones, 0),
    completaron: sumaONull(eds.map((e) => e.completaron)),
    certificados: eds.reduce((s, e) => s + e.certificados, 0),
  }))
  talleres.sort((a, b) => b.inscripciones - a.inscripciones || a.nombre.localeCompare(b.nombre, 'es'))

  // A report whose edición is out of the range leaves; one whose edición is
  // unknown (not readable, undated) stays: a report is never dropped silently.
  const gruposEnRango = grupos.filter((g) => g.edicionId === null || !fuera.has(g.edicionId))

  return {
    ediciones: dentro,
    talleres,
    grupos: gruposEnRango,
    sinFechas,
    totales: {
      talleres: talleres.length,
      ediciones: dentro.length,
      inscripciones: talleres.reduce((s, t) => s + t.inscripciones, 0),
      completaron: sumaONull(talleres.map((t) => t.completaron)),
      certificados: talleres.reduce((s, t) => s + t.certificados, 0),
    },
  }
}

type FilaDe = TallerReporte | EdicionReporte | ReporteGrupo

const PASTILLAS: Record<VistaReportes, readonly { id: FiltroReportes; etiqueta: string; cumple: (f: never) => boolean }[]> = {
  talleres: [],
  ediciones: [{ id: 'sin-cerrar', etiqueta: 'Terminadas sin cerrar', cumple: (e: EdicionReporte) => terminadaSinCerrar(e) }],
  grupos: [
    { id: 'sin-enviar', etiqueta: 'Sin enviar', cumple: (g: ReporteGrupo) => g.estado === 'borrador' },
    { id: 'reabiertos', etiqueta: 'Reabiertos', cumple: (g: ReporteGrupo) => esReabierto(g) },
  ],
}

/** The rows of a tab after its attention pill, and the pills with their counts. */
export function filasVisibles(
  datos: DatosReportes,
  vista: VistaReportes,
  filtro: FiltroReportes | null,
): { readonly filas: readonly FilaDe[]; readonly pastillas: readonly PastillaReporte[] } {
  const base: readonly FilaDe[] = vista === 'talleres' ? datos.talleres : vista === 'ediciones' ? datos.ediciones : datos.grupos
  const reglas = PASTILLAS[vista] as readonly { id: FiltroReportes; etiqueta: string; cumple: (f: FilaDe) => boolean }[]
  const pastillas = reglas.map((p) => ({ id: p.id, etiqueta: p.etiqueta, cantidad: base.filter(p.cumple).length }))
  const activa = reglas.find((p) => p.id === filtro)
  return { filas: activa ? base.filter(activa.cumple) : base, pastillas }
}

function primero(valor: string | readonly string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : (valor as string | undefined)
}

export function parseConsultaReportes(
  params: Readonly<Record<string, string | readonly string[] | undefined>> | undefined,
): ConsultaReportes {
  const vista = primero(params?.vista)
  const rango = primero(params?.rango)
  const filtro = primero(params?.filtro)
  return {
    vista: (VISTAS as readonly string[]).includes(vista ?? '') ? (vista as VistaReportes) : CONSULTA_POR_DEFECTO.vista,
    rango: (RANGOS as readonly string[]).includes(rango ?? '') ? (rango as ClaveRango) : CONSULTA_POR_DEFECTO.rango,
    filtro: (FILTROS as readonly string[]).includes(filtro ?? '') ? (filtro as FiltroReportes) : null,
  }
}

export function urlReportesTalleres(consulta: ConsultaReportes): string {
  const p = new URLSearchParams()
  if (consulta.vista !== CONSULTA_POR_DEFECTO.vista) p.set('vista', consulta.vista)
  if (consulta.rango !== CONSULTA_POR_DEFECTO.rango) p.set('rango', consulta.rango)
  if (consulta.filtro) p.set('filtro', consulta.filtro)
  const q = p.toString()
  return q ? `/talleres/reportes?${q}` : '/talleres/reportes'
}
