/**
 * «Próximos cumpleaños» of the home (odd/tasks/home-por-rol.md T7, S12; T8,
 * S14a). Two sources, merged into one section by unirCumpleanos:
 * - cumpleanosDelTablero: the birthdays of the next 14 days that
 *   obtener_datos_dashboard already returns, read from the list of the role
 *   it answered as (it decides the scope): the leader's groups, the directora
 *   de etapa's groups, the director general's visible groups, or the whole
 *   campus for admin and pastor. No tablero (it failed) or another role: none.
 * - cargarCumpleanosGrupos: the groups where the person is Miembro or Colíder,
 *   the next DIAS_CUMPLEANOS days, from proximos_cumpleanos_mis_grupos: it
 *   answers from auth.uid() with the current groupmates' day and month and
 *   the date of their next birthday, never the birth year (a plain Miembro
 *   cannot read the members' usuarios rows through RLS, L19).
 */
import { datos, intentar, type PedidoGruposMiembro } from './cargar-grupos-miembro'
import type { ClienteInicio } from './cargar-hechos'

export type Cumpleanos = {
  id: string
  nombre: string
  /** YYYY-MM-DD of the next birthday. */
  fecha: string
  /** The group, when known; null when the list mixes several. */
  contexto: string | null
}

const LISTA_POR_ROL: Record<string, string> = {
  lider: 'proximos_cumpleanos_grupo',
  'director-etapa': 'proximos_cumpleanos_alcance',
  'director-general': 'proximos_cumpleanos',
  admin: 'proximos_cumpleanos',
  pastor: 'proximos_cumpleanos',
}

const DIAS_CUMPLEANOS = 30

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

const objeto = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null

const filas = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.map(objeto).filter((f): f is Record<string, unknown> => f !== null) : []

const porFecha = (a: Cumpleanos, b: Cumpleanos): number => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre, 'es')

/** `contexto` (the group the leader leads) is used only for the leader's list. */
export function cumpleanosDelTablero(tablero: { rol: string; widgets: Record<string, unknown> } | null, contexto: string | null): Cumpleanos[] {
  const lista = tablero ? LISTA_POR_ROL[tablero.rol] : undefined
  const filasTablero = lista ? tablero?.widgets[lista] : null
  if (!Array.isArray(filasTablero)) return []
  const deGrupo = tablero?.rol === 'lider' ? contexto : null
  return filasTablero
    .flatMap((f: Record<string, unknown> | null): Cumpleanos[] => {
      if (typeof f !== 'object' || f === null) return []
      const id = texto(f.id)
      const nombre = texto(f.nombre_completo)
      const fecha = texto(f.proximo)?.slice(0, 10)
      return id && nombre && fecha ? [{ id, nombre, fecha, contexto: deGrupo }] : []
    })
    .sort(porFecha)
}

/**
 * Birthdays of the next DIAS_CUMPLEANOS days (today included) in the groups
 * where the person is Miembro or Colíder, without the person. The RPC answers
 * for every group of the person; only the groups asked for are kept. When the
 * RPC fails the list is empty.
 */
export async function cargarCumpleanosGrupos(supabase: ClienteInicio, pedido: PedidoGruposMiembro): Promise<Cumpleanos[]> {
  if (pedido.grupos.length === 0) return []
  const respuesta = await intentar(
    'proximos_cumpleanos_mis_grupos',
    async () => filas(await datos(supabase.rpc('proximos_cumpleanos_mis_grupos', { p_dias: DIAS_CUMPLEANOS }))),
    [],
  )

  // A person in two of the groups is listed once, under the first one asked for.
  const orden = new Map(pedido.grupos.map((g, i) => [g.grupoId, i]))
  const personas = new Map<string, { cumpleanos: Cumpleanos; orden: number }>()
  for (const f of respuesta) {
    const id = texto(f.usuario_id)
    const grupoId = texto(f.grupo_id)
    const nombre = [texto(f.nombre), texto(f.apellido)].filter(Boolean).join(' ')
    const fecha = texto(f.proxima)?.slice(0, 10)
    const posicion = grupoId ? orden.get(grupoId) : undefined
    if (!id || id === pedido.usuarioId || !nombre || !fecha || posicion === undefined) continue
    const anterior = personas.get(id)
    if (anterior && anterior.orden <= posicion) continue
    const contexto = texto(f.grupo_nombre) ?? pedido.grupos[posicion].nombre
    personas.set(id, { cumpleanos: { id, nombre, fecha, contexto }, orden: posicion })
  }
  return [...personas.values()].map((p) => p.cumpleanos).sort(porFecha)
}

/** One list from several sources: each person once (the first source wins), sorted by date and name. */
export function unirCumpleanos(...listas: readonly (readonly Cumpleanos[])[]): Cumpleanos[] {
  const vistos = new Set<string>()
  return listas
    .flat()
    .filter((c) => {
      if (vistos.has(c.id)) return false
      vistos.add(c.id)
      return true
    })
    .sort(porFecha)
}
