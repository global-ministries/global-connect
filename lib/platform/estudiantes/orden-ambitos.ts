/**
 * Estudiantes — the order of the ámbitos (S20 of odd/tasks/estudiantes-fase-b.md):
 * every screen, menu, select, card and list shows Transit → Inside Out →
 * The Living Room, never alphabetical; any other ámbito goes after them, A–Z.
 *
 * The RPCs sort by label (Inside Out, The Living Room, Transit), so the view
 * models re-sort with this. The Living Room is known by its experiencia
 * (`the_living_room`) or by a label that says "Living Room".
 */

export interface AmbitoOrdenable {
  readonly ambito: string
  readonly experiencia?: string | null
}

const normalizar = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** 1 Transit, 2 Inside Out, 3 The Living Room, 4 anything else. */
export function rangoAmbito(ambito: string, experiencia?: string | null): number {
  if (experiencia === 'the_living_room') return 3
  const clave = normalizar(ambito)
  if (clave.includes('transit')) return 1
  if (clave.includes('inside out')) return 2
  if (clave.includes('living room')) return 3
  return 4
}

export function compararAmbitos(a: AmbitoOrdenable, b: AmbitoOrdenable): number {
  return rangoAmbito(a.ambito, a.experiencia) - rangoAmbito(b.ambito, b.experiencia) || a.ambito.localeCompare(b.ambito, 'es')
}

/** A copy of `items` by ámbito; items of the same ámbito keep their order. */
export function ordenarPorAmbito<T>(items: readonly T[], ambitoDe: (item: T) => AmbitoOrdenable): T[] {
  return [...items].sort((x, y) => compararAmbitos(ambitoDe(x), ambitoDe(y)))
}
