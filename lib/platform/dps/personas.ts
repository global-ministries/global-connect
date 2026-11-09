/**
 * DPS planning — the person search of the programming sheet's Productor,
 * Host and Comunicador cells (odd/tasks/dps-asistencia-pco.md, T11c; S11,
 * S7.3): what is worth sending to dps_buscar_personas
 * (supabase/migrations/20261108207000_dps_buscar_personas.sql, planners
 * only, 2 to 100 characters) and how its rows are read. The RPC returns id,
 * nombre, apellido and iniciales only. Pure: safe on the client.
 */
export interface PersonaBuscada {
  readonly personaId: string
  /** «Nombre Apellido». */
  readonly nombre: string
  readonly iniciales: string
}

export const MIN_BUSQUEDA_PERSONA = 2
export const MAX_BUSQUEDA_PERSONA = 100

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** The text to search, trimmed; null when it is too short or too long to ask. */
export function textoParaBuscar(entrada: string): string | null {
  const limpio = entrada.trim()
  return limpio.length >= MIN_BUSQUEDA_PERSONA && limpio.length <= MAX_BUSQUEDA_PERSONA ? limpio : null
}

/** Reads dps_buscar_personas; rows without a valid id are dropped. */
export function leerPersonasBuscadas(data: unknown): PersonaBuscada[] {
  return (Array.isArray(data) ? data : []).flatMap((fila) => {
    const f = fila && typeof fila === 'object' ? (fila as Record<string, unknown>) : null
    if (!f || typeof f.id !== 'string' || !UUID_RE.test(f.id)) return []
    return [{ personaId: f.id, nombre: [texto(f.nombre), texto(f.apellido)].filter(Boolean).join(' '), iniciales: texto(f.iniciales) }]
  })
}
