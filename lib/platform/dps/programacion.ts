/**
 * DPS planning — the annual programming sheet (/dps/programacion,
 * odd/tasks/dps-asistencia-pco.md, T11; S6.4, S7.1, S7.3; artboard
 * prototipos/planificacion-dps/04-programacion-anual-hoja.html), the
 * replacement of the Excel "Series 2026" (L9). The database decides who
 * sees and who edits (dps_planes_rango, dps_plan_campo, dps_plan_crear and
 * dps_serie_crear in supabase/migrations/20261108201000_dps_planificacion_rpcs.sql);
 * these helpers turn its plans into the rows of the sheet (every Sunday of
 * the year, with a plan or not yet, plus the special days: Cena del Señor,
 * Noche de adoración, servicio especial, Domingo libre), read and write its
 * ten columns (Productor … Notas, the fields dps_plan_campo accepts), count
 * the summary and help "Nueva serie". Productor, host and comunicador are a
 * persona of the system or a written name, never both (S7.3): the sheet
 * shows either and writes the name or, since T11c (S11), links a persona
 * found with dps_buscar_personas (personas.ts). T11b (S9) adds the special events of
 * one or several days (dps_evento_crear: one plan per day sharing an
 * `evento`, shown as «Título · Día N de M»), moving a plan to another date
 * (dps_plan_mover) and deleting one (dps_plan_eliminar), in
 * supabase/migrations/20261108206000_dps_eventos_especiales.sql: these
 * helpers name the days, list the days of a new event, warn before sending
 * and say why a plan cannot be moved or deleted; the RPCs decide. Pure:
 * safe on the client.
 */
import { mensajeErrorDps, type ErrorRpc } from './errores'
import { ETIQUETA_TIPO, type TipoPlan } from './planilla'

export type ColumnaHoja = 'productor' | 'host' | 'comunicador' | 'opener' | 'anuncios' | 'cantantes' | 'canciones' | 'closer' | 'historia_vida' | 'notas'
export type ColumnaPersona = 'productor' | 'host' | 'comunicador'

export interface DefColumna {
  readonly id: ColumnaHoja
  readonly etiqueta: string
  /** Minimum width in px (the artboard's). */
  readonly ancho: number
  readonly tipo: 'persona' | 'texto' | 'lista'
}

/** The ten columns of the artboard, Productor to Notas, named as dps_plan_campo's campos. */
export const COLUMNAS_HOJA: readonly DefColumna[] = [
  { id: 'productor', etiqueta: 'Productor', ancho: 150, tipo: 'persona' },
  { id: 'host', etiqueta: 'Host', ancho: 150, tipo: 'persona' },
  { id: 'comunicador', etiqueta: 'Comunicador', ancho: 180, tipo: 'persona' },
  { id: 'opener', etiqueta: 'Opener', ancho: 220, tipo: 'texto' },
  { id: 'anuncios', etiqueta: 'Anuncios', ancho: 200, tipo: 'texto' },
  { id: 'cantantes', etiqueta: 'Cantantes', ancho: 180, tipo: 'texto' },
  { id: 'canciones', etiqueta: 'Canciones', ancho: 280, tipo: 'lista' },
  { id: 'closer', etiqueta: 'Closer', ancho: 180, tipo: 'texto' },
  { id: 'historia_vida', etiqueta: 'Historia de vida', ancho: 170, tipo: 'texto' },
  { id: 'notas', etiqueta: 'Notas', ancho: 200, tipo: 'texto' },
]

const PERSONAS: readonly ColumnaPersona[] = ['productor', 'host', 'comunicador']
const COLORES = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'] as const

export interface SerieHoja {
  readonly id: string
  readonly nombre: string
  readonly color: string
  readonly semanas: number | null
}

/** The event a plan is a day of (dps_evento_crear): day `dia` of `dias`, by date. */
export interface EventoPlan {
  readonly id: string
  readonly dia: number
  readonly dias: number
}

/** A plan of dps_plan_json, as the sheet needs it. */
export interface PlanHoja {
  readonly id: string
  readonly fecha: string
  readonly tipo: TipoPlan
  readonly titulo: string | null
  readonly semana: number | null
  readonly serie: SerieHoja | null
  readonly horarios: readonly string[]
  /** What each cell shows ('' when empty). */
  readonly valores: Readonly<Record<ColumnaHoja, string>>
  /** Productor / host / comunicador that are a persona of the system (not a written name). */
  readonly conFicha: Readonly<Record<ColumnaPersona, boolean>>
  /** Their persona_id (null: a written name or empty). */
  readonly personaIds: Readonly<Record<ColumnaPersona, string | null>>
  readonly evento: EventoPlan | null
  /** Someone's attendance is marked: the plan can no longer be moved or deleted. */
  readonly conAsistencia: boolean
}

/** A row of the sheet: a Sunday (its plan, or none yet) or a special day (never edited in the sheet). */
export type FilaHoja =
  | { readonly clase: 'domingo'; readonly clave: string; readonly fecha: string; readonly mes: number; readonly plan: PlanHoja | null }
  | { readonly clase: 'especial'; readonly clave: string; readonly fecha: string; readonly mes: number; readonly plan: PlanHoja }

type Objeto = Record<string, unknown>

const objeto = (v: unknown): Objeto | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Objeto) : null)
const texto = (v: unknown): string => (typeof v === 'string' ? v : '')
const textoONulo = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const entero = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null)
const tipo = (v: unknown): TipoPlan => (Object.hasOwn(ETIQUETA_TIPO, texto(v)) ? (v as TipoPlan) : 'domingo')

export const SEPARADOR_CANCIONES = ' · '

function leerEvento(v: unknown): EventoPlan | null {
  const e = objeto(v)
  const dia = entero(e?.dia)
  const dias = entero(e?.dias)
  return e && typeof e.id === 'string' && dia !== null && dias !== null && dia >= 1 && dia <= dias ? { id: e.id, dia, dias } : null
}

function valorCampo(campos: Objeto, id: ColumnaHoja): string {
  const v = campos[id]
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string').join(SEPARADOR_CANCIONES)
  return texto(v)
}

export function leerPlanHoja(v: unknown): PlanHoja | null {
  const p = objeto(v)
  if (!p || typeof p.id !== 'string' || typeof p.fecha !== 'string') return null
  const s = objeto(p.serie)
  const campos = objeto(p.campos) ?? {}
  const valores = {} as Record<ColumnaHoja, string>
  const conFicha = {} as Record<ColumnaPersona, boolean>
  const personaIds = {} as Record<ColumnaPersona, string | null>
  for (const c of COLUMNAS_HOJA) {
    if (c.tipo === 'persona') {
      const persona = objeto(p[c.id])
      valores[c.id] = texto(persona?.nombre)
      conFicha[c.id as ColumnaPersona] = typeof persona?.persona_id === 'string'
      personaIds[c.id as ColumnaPersona] = typeof persona?.persona_id === 'string' ? persona.persona_id : null
    } else {
      valores[c.id] = valorCampo(campos, c.id)
    }
  }
  return {
    id: p.id,
    fecha: p.fecha,
    tipo: tipo(p.tipo),
    titulo: textoONulo(p.titulo),
    semana: entero(p.semana),
    serie: s && typeof s.id === 'string' ? { id: s.id, nombre: texto(s.nombre), color: texto(s.color), semanas: entero(s.semanas) } : null,
    horarios: Array.isArray(p.horarios) ? p.horarios.filter((x): x is string => typeof x === 'string') : [],
    valores,
    conFicha,
    personaIds,
    evento: leerEvento(p.evento),
    conAsistencia: p.con_asistencia === true,
  }
}

/** Reads dps_planes_rango; rows without an id or a fecha are dropped. */
export function leerPlanesHoja(data: unknown): PlanHoja[] {
  return (Array.isArray(data) ? data : []).map(leerPlanHoja).filter((p): p is PlanHoja => p !== null)
}

const fechaUtc = (fecha: string): Date => new Date(`${fecha}T00:00:00Z`)
const iso = (d: Date): string => d.toISOString().slice(0, 10)

export function sumarDias(fecha: string, dias: number): string {
  const d = fechaUtc(fecha)
  d.setUTCDate(d.getUTCDate() + dias)
  return iso(d)
}

export function esDomingo(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false
  const d = fechaUtc(fecha)
  return !Number.isNaN(d.getTime()) && iso(d) === fecha && d.getUTCDay() === 0
}

/** The Sunday on or after the date. */
export function domingoDesde(fecha: string): string {
  const d = fechaUtc(fecha)
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7))
  return iso(d)
}

export function domingosDelAnio(anio: number): string[] {
  const domingos: string[] = []
  for (let f = domingoDesde(`${anio}-01-01`); f.startsWith(`${anio}-`); f = sumarDias(f, 7)) domingos.push(f)
  return domingos
}

const mesDe = (fecha: string): number => Number(fecha.slice(5, 7)) - 1

/**
 * Every Sunday of the year (its 'domingo' plan, or none yet: the first edit
 * creates it) and every other plan of the year as a special row. A free
 * Sunday (tipo 'libre') takes its Sunday's place. By date; the Sunday first.
 */
export function filasHoja(planes: readonly PlanHoja[], anio: number): FilaHoja[] {
  const delAnio = planes.filter((p) => p.fecha.startsWith(`${anio}-`))
  const domingos = new Map(delAnio.filter((p) => p.tipo === 'domingo').map((p) => [p.fecha, p]))
  const libres = new Set(delAnio.filter((p) => p.tipo === 'libre').map((p) => p.fecha))
  const filas: FilaHoja[] = []
  for (const fecha of domingosDelAnio(anio)) {
    const plan = domingos.get(fecha) ?? null
    if (!plan && libres.has(fecha)) continue
    filas.push({ clase: 'domingo', clave: plan?.id ?? `fecha:${fecha}`, fecha, mes: mesDe(fecha), plan })
  }
  for (const plan of delAnio) {
    if (plan.tipo !== 'domingo') filas.push({ clase: 'especial', clave: plan.id, fecha: plan.fecha, mes: mesDe(plan.fecha), plan })
  }
  return filas.sort((a, b) => (a.fecha === b.fecha ? Number(b.clase === 'domingo') - Number(a.clase === 'domingo') : a.fecha < b.fecha ? -1 : 1))
}

/** "2/4" of the Serie column, "3" without the series length, '' without a series. */
export function semanaSerie(plan: PlanHoja): string {
  if (!plan.serie || !plan.semana) return ''
  return plan.serie.semanas ? `${plan.semana}/${plan.serie.semanas}` : String(plan.semana)
}

/** The name of a special row: its title, else its tipo ("Cena del Señor"); a day of a multi-day event adds «· Día N de M». */
export function nombreEspecial(plan: PlanHoja): string {
  const nombre = plan.titulo ?? ETIQUETA_TIPO[plan.tipo]
  return plan.evento && plan.evento.dias > 1 ? `${nombre} · Día ${plan.evento.dia} de ${plan.evento.dias}` : nombre
}

export type ValorRpc = { readonly ok: true; readonly valor: unknown } | { readonly ok: false; readonly mensaje: string }

/**
 * What dps_plan_campo receives for a cell: productor / host / comunicador as
 * {"texto"} (the sheet writes names; a persona of the system stays until the
 * cell is rewritten), the creative fields as text, the songs as a list split
 * by «·» or «;»; null clears. Refuses locally what the RPC would refuse.
 */
export function valorParaRpc(columna: ColumnaHoja, entrada: string): ValorRpc {
  const limpio = entrada.trim()
  const def = COLUMNAS_HOJA.find((c) => c.id === columna)
  if (def?.tipo === 'lista') {
    const canciones = limpio.split(/\s*[·;]\s*/).map((c) => c.trim()).filter(Boolean)
    if (canciones.length > 10) return { ok: false, mensaje: 'Máximo 10 canciones.' }
    if (canciones.some((c) => c.length > 200)) return { ok: false, mensaje: 'Cada canción, máximo 200 caracteres.' }
    return { ok: true, valor: canciones.length > 0 ? canciones : null }
  }
  if (def?.tipo === 'persona') {
    if (limpio.length > 120) return { ok: false, mensaje: 'Máximo 120 caracteres.' }
    return { ok: true, valor: limpio ? { texto: limpio } : null }
  }
  if (limpio.length > 4000) return { ok: false, mensaje: 'Máximo 4000 caracteres.' }
  return { ok: true, valor: limpio || null }
}

/** What the cell shows after a save, before the stored plan comes back. */
export function normalizarCelda(columna: ColumnaHoja, entrada: string): string {
  const r = valorParaRpc(columna, entrada)
  if (!r.ok || r.valor === null) return ''
  if (Array.isArray(r.valor)) return r.valor.join(SEPARADOR_CANCIONES)
  return typeof r.valor === 'string' ? r.valor : texto(objeto(r.valor)?.texto)
}

export interface ResumenHoja {
  readonly domingos: number
  readonly series: number
  readonly especiales: number
  /** Productor, host or comunicador still empty on the Sundays after today, to the end of the year. */
  readonly sinAsignar: number
}

export function resumenHoja(filas: readonly FilaHoja[], hoy: string, anio: number): ResumenHoja {
  const domingos = filas.filter((f) => f.clase === 'domingo')
  const series = new Set(filas.flatMap((f) => (f.plan?.serie ? [f.plan.serie.id] : [])))
  const fin = `${anio}-12-31`
  const sinAsignar = domingos
    .filter((f) => f.fecha > hoy && f.fecha <= fin)
    .reduce((n, f) => n + PERSONAS.filter((c) => !f.plan?.valores[c]).length, 0)
  return { domingos: domingos.length, series: series.size, especiales: filas.length - domingos.length, sinAsignar }
}

/** The clave of the first Sunday after today (the artboard's "Próximo"), or null. */
export function proximoDomingo(filas: readonly FilaHoja[], hoy: string): string | null {
  return filas.find((f) => f.clase === 'domingo' && f.fecha > hoy)?.clave ?? null
}

/** The Sundays a new series takes, one week apart. */
export function domingosSerie(primerDomingo: string, semanas: number): string[] {
  return Array.from({ length: Math.max(0, Math.floor(semanas)) }, (_, i) => sumarDias(primerDomingo, 7 * i))
}

/** The Sundays of the new series that already belong to another one (dps_serie_crear would answer 'domingo_ocupado'). */
export function choquesSerie(planes: readonly PlanHoja[], primerDomingo: string, semanas: number): { fecha: string; serie: string }[] {
  const fechas = new Set(domingosSerie(primerDomingo, semanas))
  return planes
    .filter((p) => p.tipo === 'domingo' && p.serie && fechas.has(p.fecha))
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
    .map((p) => ({ fecha: p.fecha, serie: p.serie!.nombre }))
}

/** A chart color unlike the series right before and right after the new one: the next one in rotation after the one before. */
export function colorNuevaSerie(planes: readonly PlanHoja[], primerDomingo: string, semanas: number): string {
  const conSerie = planes.filter((p) => p.tipo === 'domingo' && p.serie).sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
  const fin = sumarDias(primerDomingo, 7 * Math.max(1, semanas))
  const antes = [...conSerie].reverse().find((p) => p.fecha < primerDomingo)?.serie?.color ?? null
  const despues = conSerie.find((p) => p.fecha >= fin)?.serie?.color ?? null
  const inicio = antes ? (COLORES.indexOf(antes as (typeof COLORES)[number]) + 1) % COLORES.length : 0
  for (let i = 0; i < COLORES.length; i += 1) {
    const color = COLORES[(inicio + i) % COLORES.length]
    if (color !== antes && color !== despues) return color
  }
  return COLORES[0]
}

/** The dialog's first Sunday: after the year's last series Sunday, never before the next Sunday from today (or the year's first). */
export function primerDomingoSugerido(planes: readonly PlanHoja[], hoy: string, anio: number): string {
  const inicioAnio = `${anio}-01-01`
  const base = domingoDesde(hoy > inicioAnio ? hoy : inicioAnio)
  const ultimo = planes
    .filter((p) => p.tipo === 'domingo' && p.serie && p.fecha.startsWith(`${anio}-`))
    .reduce<string | null>((max, p) => (max === null || p.fecha > max ? p.fecha : max), null)
  const despues = ultimo ? sumarDias(ultimo, 7) : null
  return despues && despues > base ? despues : base
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] as const
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const

export const nombreMes = (mes: number): string => MESES[mes] ?? ''

/** "15 de noviembre", for the input names and the live sentences. */
export function fechaCorta(fecha: string): string {
  const d = fechaUtc(fecha)
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()] ?? ''}`
}

/** The Fecha cell: "dom", "15", "nov". */
export function partesFecha(fecha: string): { dia: string; numero: number; mes: string } {
  const d = fechaUtc(fecha)
  return { dia: DIAS_CORTOS[d.getUTCDay()] ?? '', numero: d.getUTCDate(), mes: (MESES[d.getUTCMonth()] ?? '').slice(0, 3) }
}

/** The RPC errors of the sheet and of "Nueva serie", naming the Sunday another series holds. */
export function mensajeErrorProgramacion(error: ErrorRpc | null | undefined): string {
  if (error?.message?.includes('domingo_ocupado') && error.details && /^\d{4}-\d{2}-\d{2}$/.test(error.details)) {
    return `El domingo ${fechaCorta(error.details)} ya es de otra serie. Elige otro primer domingo o menos semanas.`
  }
  // A person picked in Productor, Host or Comunicador (S11) that no longer exists.
  if (error?.message?.includes('persona_invalida')) return 'Esa persona ya no está en la plataforma. Búscala de nuevo.'
  return mensajeErrorDps(error, 'programacion')
}

// ── special events (T11b, S9) ────────────────────────────────────────

export type TipoEvento = 'especial' | 'cena_del_senor' | 'noche_adoracion'

/** What dps_evento_crear takes: a Sunday is in the year's Sundays and a free Sunday is no event. */
export const TIPOS_EVENTO: readonly { readonly valor: TipoEvento; readonly etiqueta: string }[] = (['especial', 'cena_del_senor', 'noche_adoracion'] as const).map(
  (valor) => ({ valor, etiqueta: ETIQUETA_TIPO[valor] }),
)

/** dps_evento_crear's limit. */
export const MAX_DIAS_EVENTO = 14

const fechaValida = (fecha: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(fecha) && !Number.isNaN(fechaUtc(fecha).getTime()) && iso(fechaUtc(fecha)) === fecha

/** The days of a new event, Del to Al inclusive (Al empty = one day); [] when the dates are not valid or inverted. */
export function diasEvento(desde: string, hasta: string): string[] {
  const fin = hasta === '' ? desde : hasta
  if (!fechaValida(desde) || !fechaValida(fin) || fin < desde) return []
  const dias: string[] = []
  for (let f = desde; f <= fin && dias.length <= MAX_DIAS_EVENTO; f = sumarDias(f, 1)) dias.push(f)
  return dias
}

/** What «Nuevo evento» says before sending (null: the dates are fine). */
export function avisoEvento(desde: string, hasta: string): string | null {
  if (!fechaValida(desde)) return 'Elige la fecha del evento.'
  if (hasta !== '' && !fechaValida(hasta)) return 'Revisa la fecha del último día.'
  if (hasta !== '' && hasta < desde) return 'El último día no puede ser antes del primero.'
  if (diasEvento(desde, hasta).length > MAX_DIAS_EVENTO) return `Un evento dura como máximo ${MAX_DIAS_EVENTO} días.`
  return null
}

const clave = (texto: string): string => texto.trim().toLocaleLowerCase('es')

/** The dates that already have a plan of that tipo and título (dps_planes_fecha_tipo_titulo_uidx: 'plan_duplicado'). */
export function choquesEvento(planes: readonly PlanHoja[], tipo: string, titulo: string, fechas: readonly string[]): string[] {
  if (clave(titulo) === '') return []
  const ocupadas = new Set(planes.filter((p) => p.tipo === tipo && clave(p.titulo ?? '') === clave(titulo)).map((p) => p.fecha))
  return fechas.filter((f) => ocupadas.has(f))
}

/** Why dps_plan_mover would refuse the plan (null: it can move). */
export function bloqueoMover(plan: PlanHoja, hoy: string): string | null {
  if (plan.tipo === 'domingo') return 'Los domingos de la programación no se mueven.'
  if (plan.fecha < hoy) return 'Este día ya pasó: no se puede mover.'
  if (plan.conAsistencia) return 'Este día ya tiene asistencia marcada: no se puede mover.'
  return null
}

/** Why dps_plan_eliminar would refuse the plan alone (null: it can go). */
export function bloqueoEliminar(plan: PlanHoja): string | null {
  if (plan.tipo === 'domingo') return 'Los domingos de la programación no se eliminan.'
  if (plan.conAsistencia) return 'Este día ya tiene asistencia marcada: no se puede eliminar.'
  return null
}

/** The days of the plan's event, by date (just the plan when it is not an event day). */
export function diasDelEvento(planes: readonly PlanHoja[], plan: PlanHoja): PlanHoja[] {
  if (!plan.evento) return [plan]
  return planes.filter((p) => p.evento?.id === plan.evento!.id).sort((a, b) => (a.fecha === b.fecha ? (a.id < b.id ? -1 : 1) : a.fecha < b.fecha ? -1 : 1))
}

/** The errors of «Nuevo evento», «Mover fecha» and «Eliminar evento», naming the date of a clash. */
export function mensajeErrorEvento(error: ErrorRpc | null | undefined): string {
  if (error?.message?.includes('plan_duplicado') && error.details && fechaValida(error.details)) {
    return `Ya hay un evento de ese tipo con ese título el ${fechaCorta(error.details)}.`
  }
  return mensajeErrorDps(error, 'evento')
}
