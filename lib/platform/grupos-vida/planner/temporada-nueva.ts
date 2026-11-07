/**
 * Planner — the season rules of the new-season assistant (T8b of
 * odd/tasks/planner-gdv.md; S18, S19, S20; design/planner-gdv README A14).
 *
 * Cohort rule: a name ending in "-I" starts in February, one ending in "-II"
 * in October, and each lasts about a year, so two cohorts overlap. A new
 * "-I" closes the previous "-I", a new "-II" the previous "-II"; the other
 * cohort is never touched.
 *
 * - cohorteDe mirrors planner_cohorte (20261107100000_planner_lecturas.sql).
 * - sugerirTemporada: the next "<año>-<cohorte>" after the latest season of
 *   the cohort (by start), the year after its year and never a name that
 *   already exists in any spelling; it starts the Monday after that season
 *   ends (a year after it started when it has no end) and lasts 52 weeks
 *   (Monday to Sunday). 2026-I (2026-02-16 → 2027-02-05) gives 2027-I
 *   2027-02-08 → 2028-02-06. A cohort without seasons starts on the next
 *   first Monday of its month.
 * - temporadaQueCierra mirrors planner_temporada_origen: the latest season
 *   of the same cohort that starts before the new one.
 * - validarNuevaTemporada makes planner_crear_temporada's checks
 *   (20261107120000_planner_temporada.sql) with its words, so the assistant
 *   says what is wrong before calling it; the RPC checks again.
 *
 * Dates are 'YYYY-MM-DD' strings, computed in UTC. Pure: no Supabase, no React.
 */
import type { Cohorte, TemporadaPlanner } from './tipos'

const COHORTE = /(?:^|[^A-Z])(II|I)$/
const MES_COHORTE: Readonly<Record<Cohorte, number>> = { I: 2, II: 10 }
const LARGO_NOMBRE = 80
const DIA_MS = 86_400_000

/** 'I', 'II' or null, as planner_cohorte: the suffix of the trimmed, upper-cased name. */
export function cohorteDe(nombre: string): Cohorte | null {
  const encontrada = COHORTE.exec(nombre.trim().toUpperCase())?.[1]
  return encontrada === 'I' || encontrada === 'II' ? encontrada : null
}

/** The first four-digit year of the name ("2025 - II" → 2025). */
export function anioTemporada(nombre: string): number | null {
  const anio = /\d{4}/.exec(nombre)?.[0]
  return anio ? Number(anio) : null
}

/** As planner_crear_temporada compares names: lowercase, no accents, only letters and digits. */
const claveNombre = (nombre: string): string =>
  nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

export const mismoNombreTemporada = (una: string, otra: string): boolean => claveNombre(una) === claveNombre(otra)

// ─── Dates ───

const aFecha = (iso: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const fecha = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}

const aIso = (fecha: Date): string => fecha.toISOString().slice(0, 10)

const sumarDias = (fecha: Date, dias: number): Date => new Date(fecha.getTime() + dias * DIA_MS)

/** The Monday strictly after `fecha`. */
const lunesDespues = (fecha: Date): Date => sumarDias(fecha, ((8 - fecha.getUTCDay()) % 7) || 7)

/** The first Monday of the month (1-12) of the year. */
const primerLunes = (anio: number, mes: number): Date => {
  const primero = new Date(Date.UTC(anio, mes - 1, 1))
  return sumarDias(primero, (8 - primero.getUTCDay()) % 7)
}

/** 52 weeks: from a Monday to the Sunday 363 days later. */
const finDeTemporada = (inicio: Date): Date => sumarDias(inicio, 363)

// ─── Suggestions ───

export interface SugerenciaTemporada {
  readonly nombre: string
  readonly cohorte: Cohorte
  readonly fecha_inicio: string
  readonly fecha_fin: string
  /** The latest season of the cohort, the one the suggestion follows (and closes); null for a cohort without seasons. */
  readonly anterior: TemporadaPlanner | null
}

const porInicioDesc = (a: TemporadaPlanner, b: TemporadaPlanner): number =>
  (b.fecha_inicio ?? '').localeCompare(a.fecha_inicio ?? '') || a.id.localeCompare(b.id)

const deLaCohorte = (temporadas: readonly TemporadaPlanner[], cohorte: Cohorte): TemporadaPlanner[] =>
  temporadas.filter((t) => cohorteDe(t.nombre) === cohorte && aFecha(t.fecha_inicio ?? '') !== null).sort(porInicioDesc)

/** The next season of the cohort after its latest one (A14); `hoy` only matters for a cohort without seasons. */
export function sugerirTemporada(temporadas: readonly TemporadaPlanner[], cohorte: Cohorte, hoy: string): SugerenciaTemporada {
  const anterior = deLaCohorte(temporadas, cohorte)[0] ?? null
  let inicio: Date
  let anio: number
  if (anterior) {
    const inicioAnterior = aFecha(anterior.fecha_inicio ?? '') as Date
    const finAnterior = aFecha(anterior.fecha_fin ?? '')
    inicio = lunesDespues(finAnterior && finAnterior > inicioAnterior ? finAnterior : sumarDias(inicioAnterior, 363))
    anio = (anioTemporada(anterior.nombre) ?? inicioAnterior.getUTCFullYear()) + 1
  } else {
    const desde = aFecha(hoy) ?? new Date()
    anio = desde.getUTCFullYear()
    inicio = primerLunes(anio, MES_COHORTE[cohorte])
    if (inicio < desde) {
      anio += 1
      inicio = primerLunes(anio, MES_COHORTE[cohorte])
    }
  }
  let nombre = `${anio}-${cohorte}`
  while (temporadas.some((t) => mismoNombreTemporada(t.nombre, nombre))) {
    anio += 1
    nombre = `${anio}-${cohorte}`
  }
  return { nombre, cohorte, fecha_inicio: aIso(inicio), fecha_fin: aIso(finDeTemporada(inicio)), anterior }
}

/** The next season to plan: of the two cohorts, the one whose next season starts first. */
export function sugerirSiguienteTemporada(temporadas: readonly TemporadaPlanner[], hoy: string): SugerenciaTemporada {
  const [una, otra] = (['I', 'II'] as const).map((c) => sugerirTemporada(temporadas, c, hoy))
  return otra.fecha_inicio < una.fecha_inicio ? otra : una
}

/**
 * S19: the season a new one closes when it is published, as
 * planner_temporada_origen: the latest of the same cohort that starts before
 * it (`excluir`: the season itself, when it already exists). Null without a
 * cohort, a start date or a previous season.
 */
export function temporadaQueCierra(
  temporadas: readonly TemporadaPlanner[],
  nombre: string,
  fechaInicio: string,
  excluir: string | null = null,
): TemporadaPlanner | null {
  const cohorte = cohorteDe(nombre)
  if (!cohorte || !aFecha(fechaInicio)) return null
  return deLaCohorte(temporadas, cohorte).find((t) => t.id !== excluir && (t.fecha_inicio ?? '') < fechaInicio) ?? null
}

/**
 * The other cohort's season that keeps running (S19): its latest one still
 * in planning or active. Null when there is none.
 */
export function otraCohorteNoSeToca(temporadas: readonly TemporadaPlanner[], nombre: string): TemporadaPlanner | null {
  const cohorte = cohorteDe(nombre)
  if (!cohorte) return null
  const otra: Cohorte = cohorte === 'I' ? 'II' : 'I'
  return deLaCohorte(temporadas, otra).find((t) => t.activa || t.estado === 'planificacion' || t.estado === 'activa') ?? null
}

// ─── Checks before planner_crear_temporada ───

export interface DatosNuevaTemporada {
  readonly nombre: string
  readonly fecha_inicio: string
  readonly fecha_fin: string
}

/** planner_crear_temporada's checks, in its order and with its words; the values with single spaces. */
export function validarNuevaTemporada(
  temporadas: readonly TemporadaPlanner[],
  datos: DatosNuevaTemporada,
): { readonly valores: DatosNuevaTemporada } | { readonly error: string } {
  const nombre = datos.nombre.replace(/\s+/g, ' ').trim()
  if (!nombre) return { error: 'La temporada debe tener nombre.' }
  if (nombre.length > LARGO_NOMBRE) return { error: `El nombre de la temporada puede tener hasta ${LARGO_NOMBRE} caracteres.` }
  const cohorte = cohorteDe(nombre)
  if (!cohorte) return { error: 'El nombre debe terminar en la cohorte: I (empieza en febrero) o II (empieza en octubre), por ejemplo «2027 - I».' }
  const inicio = aFecha(datos.fecha_inicio)
  const fin = aFecha(datos.fecha_fin)
  if (!inicio || !fin) return { error: 'Indica la fecha de inicio y la de fin.' }
  if (fin <= inicio) return { error: 'La fecha de fin debe ser posterior a la de inicio.' }
  const choque = [...temporadas].sort((a, b) => -porInicioDesc(a, b)).find((t) => mismoNombreTemporada(t.nombre, nombre))
  if (choque) return { error: `Ya existe una temporada llamada «${choque.nombre}».` }
  const ultima = deLaCohorte(temporadas, cohorte)[0]
  if (ultima && datos.fecha_inicio <= (ultima.fecha_inicio ?? '')) {
    return { error: `La temporada debe empezar después del ${ultima.fecha_inicio}, inicio de «${ultima.nombre}», la última de la cohorte ${cohorte}.` }
  }
  return { valores: { nombre, fecha_inicio: datos.fecha_inicio, fecha_fin: datos.fecha_fin } }
}
