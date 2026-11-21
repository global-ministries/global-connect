/**
 * Short person names (S1 of odd/tasks/dream-team-estructura-correcciones.md):
 * first name + first surname, «Isaac José Paez Cordero» → «Isaac Paez».
 *
 * `nombreCorto` takes nombre and apellido as stored (usuarios.nombre /
 * usuarios.apellido). The first surname keeps its particles («De la Cruz
 * Pérez» → «De la Cruz», «del Valle Rojas» → «del Valle»). A couple («Carlos
 * y Ana») stays whole, as the org chart always showed it.
 *
 * `nombreCortoDeCompleto` is the fallback for a name that only arrives joined
 * (the Grupos de Vida branch, concatenated in SQL): two words stay as they
 * are, three keep the first and the last (as before), four or more keep the
 * first and the first surname from the third word on.
 *
 * Pure, shared by server and client.
 */

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los'])

function palabras(texto: string | null | undefined): string[] {
  return (texto ?? '').split(/\s+/).filter(Boolean)
}

function esPareja(partes: readonly string[]): boolean {
  return partes.some((parte) => parte.toLocaleLowerCase('es') === 'y')
}

/** «De la Cruz Pérez» → «De la Cruz»: the particles plus the first real word. */
function primerApellido(partes: readonly string[]): string {
  const tomadas: string[] = []
  for (const parte of partes) {
    tomadas.push(parte)
    if (!PARTICULAS.has(parte.toLocaleLowerCase('es'))) break
  }
  return tomadas.join(' ')
}

/** First word of `nombre` + first surname of `apellido`; empty parts are skipped. */
export function nombreCorto(nombre: string | null | undefined, apellido?: string | null): string {
  const nombres = palabras(nombre)
  const apellidos = palabras(apellido)
  if (esPareja(nombres)) return [...nombres, ...apellidos].join(' ')
  return [nombres[0] ?? '', primerApellido(apellidos)].filter(Boolean).join(' ')
}

/** The same short name from a name that only arrives joined. */
export function nombreCortoDeCompleto(completo: string): string {
  const partes = palabras(completo)
  if (partes.length <= 2 || esPareja(partes)) return partes.join(' ')
  if (partes.length === 3) return `${partes[0]} ${partes[2]}`
  return `${partes[0]} ${primerApellido(partes.slice(2))}`
}
