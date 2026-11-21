/**
 * Personas — the short name of a person: first nombre + first apellido
 * («Isaac José» «Paez Cordero» → «Isaac Paez»). Used where a person is listed
 * compactly (the «¿Es alguna de estas personas?» matches,
 * odd/tasks/dream-team-estructura-correcciones.md S1/S6b).
 */
function primeraPalabra(texto: string | null | undefined): string {
  return (texto ?? '').trim().split(/\s+/)[0] ?? ''
}

export function nombreCorto(nombre: string | null | undefined, apellido: string | null | undefined): string {
  return [primeraPalabra(nombre), primeraPalabra(apellido)].filter((p) => p !== '').join(' ')
}
