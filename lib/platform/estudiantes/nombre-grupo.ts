/**
 * Estudiantes — the name of a small group (artboard 08, assumption A15 of
 * design/estudiantes-asistencia/README.md): Transit / Inside Out suggest
 * "<año> · <Chicas|Chicos>", The Living Room "<zona> · <Chicas|Chicos>"; a
 * second group with the same name gets "B", "C"… Names are unique per
 * sub-área and campus among active groups, compared like the database index
 * (lower(btrim(nombre))).
 */
import type { Experiencia } from './grupos-datos'

export const LARGO_MAXIMO_NOMBRE = 80

const clave = (nombre: string): string => nombre.trim().toLocaleLowerCase('es')

/** "Grupos de Chicas" → "Chicas"; any other label stays as it is. */
export function sexoDeSubarea(subarea: string): string {
  const resto = subarea.trim().replace(/^grupos de\s+/i, '')
  return resto.charAt(0).toLocaleUpperCase('es') + resto.slice(1)
}

export interface DatosNombre {
  readonly experiencia: Experiencia
  readonly anioEtiqueta: string | null
  readonly zona: string
  readonly subarea: string
}

/** The suggestion before checking duplicates; `null` while the año or the zona is missing. */
export function baseNombreGrupo({ experiencia, anioEtiqueta, zona, subarea }: DatosNombre): string | null {
  const primero = experiencia === 'the_living_room' ? zona.trim() : (anioEtiqueta ?? '').trim()
  return primero ? `${primero} · ${sexoDeSubarea(subarea)}` : null
}

/** The base, or the base plus the first free letter (B, C, …) when it is taken. */
export function sugerirNombreGrupo(base: string | null, existentes: readonly string[]): string | null {
  if (base === null) return null
  const tomados = new Set(existentes.map(clave))
  if (!tomados.has(clave(base))) return base
  for (let codigo = 'B'.charCodeAt(0); codigo <= 'Z'.charCodeAt(0); codigo += 1) {
    const candidato = `${base} ${String.fromCharCode(codigo)}`
    if (!tomados.has(clave(candidato))) return candidato
  }
  return null
}

export interface DatosPista {
  readonly experiencia: Experiencia
  readonly base: string | null
  readonly sugerido: string | null
  /** The user typed their own name: the suggestion no longer follows the año or zona. */
  readonly editado: boolean
}

/** The hint under the Nombre field. */
export function pistaNombre({ experiencia, base, sugerido, editado }: DatosPista): string {
  if (editado) return 'Nombre propio. Bórralo para volver a la sugerencia.'
  const tlr = experiencia === 'the_living_room'
  if (base === null || sugerido === null) {
    return tlr ? 'Escribe la zona y te sugerimos un nombre.' : 'Elige el año y te sugerimos un nombre.'
  }
  if (sugerido !== base) return `Ya existe «${base}», por eso sugerimos «${sugerido}».`
  return `Sugerido por ${tlr ? 'la zona' : 'el año'} y la sub-área. Puedes cambiarlo.`
}

/** The error of the Nombre field before saving, or `null` when it can be saved. */
export function validarNombreGrupo(nombre: string, existentes: readonly string[]): string | null {
  const limpio = nombre.trim()
  if (!limpio) return 'Escribe un nombre para el grupo.'
  if (limpio.length > LARGO_MAXIMO_NOMBRE) return `El nombre admite hasta ${LARGO_MAXIMO_NOMBRE} caracteres.`
  const igual = existentes.find((existente) => clave(existente) === clave(limpio))
  return igual === undefined ? null : `Ya hay un grupo llamado «${igual.trim()}» en esta sub-área. Elige otro nombre.`
}
