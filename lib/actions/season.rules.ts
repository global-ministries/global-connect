/**
 * Rules of the admin season form (T9a of odd/tasks/planner-gdv.md; S19, S20).
 *
 * Publishing a season from the planner closes the previous season of its
 * cohort (planner_temporada_origen: the latest of the same cohort that starts
 * before it). So a create or an edit here must never put a season in another
 * one's place:
 *
 * - Create: planner_crear_temporada's checks and words
 *   (20261107120000_planner_temporada.sql, mirrored by validarNuevaTemporada):
 *   cohort suffix I or II, a name unique without punctuation, spaces, case or
 *   accents, and a start after the last season of its cohort.
 * - Edit: the same name checks against the other seasons; the cohort never
 *   changes (a legacy season without cohort may keep none, but cannot get
 *   one); the start stays after the previous season of its cohort and before
 *   the next one, so the cohort order, and every origin, stays the same.
 *
 * Each refusal names the form field it is about. Dates are 'YYYY-MM-DD'
 * (longer values are cut to the day). Pure: no Supabase, no React.
 */
import { cohorteDe, mismoNombreTemporada } from '@/lib/platform/grupos-vida/planner/temporada-nueva'

export interface TemporadaExistente {
  readonly id: string
  readonly nombre: string
  readonly fecha_inicio: string | null
  readonly fecha_fin?: string | null
}

export interface DatosTemporada {
  readonly nombre: string
  readonly fecha_inicio: string
  readonly fecha_fin: string
}

export type CampoTemporada = 'nombre' | 'fecha_inicio' | 'fecha_fin'

export type ResultadoTemporada =
  | { readonly ok: true; readonly valores: DatosTemporada }
  | { readonly ok: false; readonly campo: CampoTemporada; readonly error: string }

const LARGO_NOMBRE = 80

const rechazo = (campo: CampoTemporada, error: string): ResultadoTemporada => ({ ok: false, campo, error })

const dia = (fecha: string | null | undefined): string => (fecha ?? '').slice(0, 10)

const esFecha = (iso: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(new Date(`${iso}T00:00:00Z`).getTime())

/** Oldest first, as planner_crear_temporada reports a name clash (ORDER BY fecha_inicio, id). */
const porInicio = (a: TemporadaExistente, b: TemporadaExistente): number =>
  dia(a.fecha_inicio).localeCompare(dia(b.fecha_inicio)) || a.id.localeCompare(b.id)

/** The name, length, cohort and date checks shared by create and edit; the name with single spaces. */
function validarDatos(
  temporadas: readonly TemporadaExistente[],
  datos: DatosTemporada,
  cohorteActual: { readonly temporada: TemporadaExistente } | null,
): ResultadoTemporada {
  const nombre = datos.nombre.replace(/\s+/g, ' ').trim()
  if (!nombre) return rechazo('nombre', 'La temporada debe tener nombre.')
  if (nombre.length > LARGO_NOMBRE) return rechazo('nombre', `El nombre de la temporada puede tener hasta ${LARGO_NOMBRE} caracteres.`)

  const cohorte = cohorteDe(nombre)
  const actual = cohorteActual?.temporada
  const anterior = actual ? cohorteDe(actual.nombre) : null
  if (actual && !anterior && cohorte) {
    return rechazo('nombre', `«${actual.nombre}» no tiene cohorte y no se le puede agregar una: cambiaría qué temporada cierra el planificador al publicar.`)
  }
  if (!cohorte && !(actual && !anterior)) {
    return rechazo('nombre', 'El nombre debe terminar en la cohorte: I (empieza en febrero) o II (empieza en octubre), por ejemplo «2027 - I».')
  }
  if (actual && anterior && cohorte !== anterior) {
    return rechazo('nombre', `«${actual.nombre}» es de la cohorte ${anterior}: el nombre debe seguir terminando en ${anterior}.`)
  }

  if (!esFecha(datos.fecha_inicio)) return rechazo('fecha_inicio', 'Indica la fecha de inicio y la de fin.')
  if (!esFecha(datos.fecha_fin)) return rechazo('fecha_fin', 'Indica la fecha de inicio y la de fin.')
  if (datos.fecha_fin <= datos.fecha_inicio) return rechazo('fecha_fin', 'La fecha de fin debe ser posterior a la de inicio.')

  const choque = [...temporadas].sort(porInicio).find((t) => t.id !== actual?.id && mismoNombreTemporada(t.nombre, nombre))
  if (choque) return rechazo('nombre', `Ya existe una temporada llamada «${choque.nombre}».`)

  return { ok: true, valores: { nombre, fecha_inicio: datos.fecha_inicio, fecha_fin: datos.fecha_fin } }
}

/** The seasons of a cohort with a start date, oldest first. */
const deLaCohorte = (temporadas: readonly TemporadaExistente[], cohorte: string): TemporadaExistente[] =>
  temporadas.filter((t) => cohorteDe(t.nombre) === cohorte && esFecha(dia(t.fecha_inicio))).sort(porInicio)

/** A new season, as planner_crear_temporada checks it. */
export function validarCreacionTemporada(temporadas: readonly TemporadaExistente[], datos: DatosTemporada): ResultadoTemporada {
  const resultado = validarDatos(temporadas, datos, null)
  if (!resultado.ok) return resultado
  const cohorte = cohorteDe(resultado.valores.nombre) as string
  const ultima = deLaCohorte(temporadas, cohorte).at(-1)
  if (ultima && datos.fecha_inicio <= dia(ultima.fecha_inicio)) {
    return rechazo('fecha_inicio', `La temporada debe empezar después del ${dia(ultima.fecha_inicio)}, inicio de «${ultima.nombre}», la última de la cohorte ${cohorte}.`)
  }
  return resultado
}

/** An edit of season `id` that keeps its cohort and its place in it. */
export function validarEdicionTemporada(
  temporadas: readonly TemporadaExistente[],
  id: string,
  datos: DatosTemporada,
): ResultadoTemporada {
  const actual = temporadas.find((t) => t.id === id)
  if (!actual) return rechazo('nombre', 'La temporada no existe.')
  const resultado = validarDatos(temporadas, datos, { temporada: actual })
  if (!resultado.ok) return resultado

  const cohorte = cohorteDe(actual.nombre)
  if (!cohorte) return resultado
  const otras = deLaCohorte(temporadas, cohorte).filter((t) => t.id !== id)
  const antes = otras.filter((t) => porInicio(t, actual) < 0).at(-1)
  const despues = otras.find((t) => porInicio(t, actual) > 0)
  if (antes && datos.fecha_inicio <= dia(antes.fecha_inicio)) {
    return rechazo('fecha_inicio', `La temporada debe empezar después del ${dia(antes.fecha_inicio)}, inicio de «${antes.nombre}», la anterior de la cohorte ${cohorte}.`)
  }
  if (despues && datos.fecha_inicio >= dia(despues.fecha_inicio)) {
    return rechazo('fecha_inicio', `La temporada debe empezar antes del ${dia(despues.fecha_inicio)}, inicio de «${despues.nombre}», la siguiente de la cohorte ${cohorte}.`)
  }
  return resultado
}
