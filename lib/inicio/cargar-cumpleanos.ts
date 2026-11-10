/**
 * «Próximos cumpleaños» of the home (odd/tasks/home-por-rol.md T7, S12): the
 * birthdays of the next 14 days that obtener_datos_dashboard already returns,
 * read from the list of the role it answered as (it decides the scope): the
 * leader's groups, the directora de etapa's groups, the director general's
 * visible groups, or the whole campus for admin and pastor. No tablero (it
 * failed) or another role: no birthdays (hidden).
 */
export type Cumpleanos = {
  id: string
  nombre: string
  /** YYYY-MM-DD of the next birthday. */
  fecha: string
  /** The group, when the person leads one; null when the list mixes several. */
  contexto: string | null
}

const LISTA_POR_ROL: Record<string, string> = {
  lider: 'proximos_cumpleanos_grupo',
  'director-etapa': 'proximos_cumpleanos_alcance',
  'director-general': 'proximos_cumpleanos',
  admin: 'proximos_cumpleanos',
  pastor: 'proximos_cumpleanos',
}

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** `contexto` (the group the leader leads) is used only for the leader's list. */
export function cumpleanosDelTablero(tablero: { rol: string; widgets: Record<string, unknown> } | null, contexto: string | null): Cumpleanos[] {
  const lista = tablero ? LISTA_POR_ROL[tablero.rol] : undefined
  const filas = lista ? tablero?.widgets[lista] : null
  if (!Array.isArray(filas)) return []
  const deGrupo = tablero?.rol === 'lider' ? contexto : null
  return filas
    .flatMap((f: Record<string, unknown> | null): Cumpleanos[] => {
      if (typeof f !== 'object' || f === null) return []
      const id = texto(f.id)
      const nombre = texto(f.nombre_completo)
      const fecha = texto(f.proximo)?.slice(0, 10)
      return id && nombre && fecha ? [{ id, nombre, fecha, contexto: deGrupo }] : []
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre, 'es'))
}
