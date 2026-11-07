/**
 * Planner — small text helpers shared by the rules: name comparison, counts
 * in singular or plural, Spanish lists and the names of people and couples.
 */

/** For comparisons: lowercase, without accents, single spaces, trimmed. */
export const normalizar = (texto: string): string =>
  texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/\s+/g, ' ').trim()

/** "1 bloqueo" / "20 bloqueos". */
export const contar = (cantidad: number, singular: string, plural: string): string =>
  `${cantidad} ${cantidad === 1 ? singular : plural}`

/** "a", "a y b", "a, b y c". */
export function enLista(elementos: readonly string[]): string {
  if (elementos.length <= 1) return elementos[0] ?? ''
  return `${elementos.slice(0, -1).join(', ')} y ${elementos[elementos.length - 1]}`
}

export interface Nombrable {
  readonly nombre: string
  readonly apellido: string
}

/** "Ana Pérez". */
export const nombrePersona = ({ nombre, apellido }: Nombrable): string => `${nombre.trim()} ${apellido.trim()}`.trim()

/** "Orlando y Luisa Pérez" with one surname; "Orlando Pérez y Luisa Gómez" otherwise. */
export function nombrePareja(una: Nombrable, otra: Nombrable): string {
  if (normalizar(una.apellido) !== normalizar(otra.apellido)) return `${nombrePersona(una)} y ${nombrePersona(otra)}`
  return `${una.nombre.trim()} y ${nombrePersona(otra)}`
}
