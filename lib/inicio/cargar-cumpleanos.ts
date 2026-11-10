/**
 * «Próximos cumpleaños» of the home (odd/tasks/home-por-rol.md T7, S12; T8,
 * S14a). Two sources, merged into one section by unirCumpleanos:
 * - cumpleanosDelTablero: the birthdays of the next 14 days that
 *   obtener_datos_dashboard already returns, read from the list of the role
 *   it answered as (it decides the scope): the leader's groups, the directora
 *   de etapa's groups, the director general's visible groups, or the whole
 *   campus for admin and pastor. No tablero (it failed) or another role: none.
 * - cargarCumpleanosGrupos: the groups where the person is Miembro or Colíder,
 *   the next DIAS_CUMPLEANOS days. The members come from obtener_detalle_grupo
 *   and their birth dates from usuarios read with the session, so RLS
 *   (puede_ver_usuario) decides whose dates come back. Only the date of the
 *   next birthday leaves the loader, never the birth year.
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

const esBisiesto = (anio: number): boolean => (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0

/** The next birthday from `hoy` (included), YYYY-MM-DD; 29 Feb falls on 28 Feb when the year is not leap. */
function proximoCumpleanos(nacimiento: string, hoy: string): string | null {
  const partes = /^\d{4}-(\d{2})-(\d{2})/.exec(nacimiento)
  if (!partes) return null
  const mes = partes[1]
  const dia = Number(partes[2])
  const en = (anio: number) => `${anio}-${mes}-${String(mes === '02' && dia === 29 && !esBisiesto(anio) ? 28 : dia).padStart(2, '0')}`
  const anio = Number(hoy.slice(0, 4))
  return en(anio) >= hoy ? en(anio) : en(anio + 1)
}

const diasEntre = (desde: string, hasta: string): number =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000)

type DetalleCumpleanos = { nombre: string | null; miembros: { id: string; nombre: string }[] }

function aDetalleCumpleanos(data: unknown): DetalleCumpleanos {
  const g = objeto(data)
  if (!g) throw new Error('sin detalle')
  return {
    nombre: texto(g.nombre),
    miembros: filas(g.miembros).flatMap((m) => {
      const id = texto(m.id)
      const nombre = [texto(m.nombre), texto(m.apellido)].filter(Boolean).join(' ')
      return id && nombre ? [{ id, nombre }] : []
    }),
  }
}

/**
 * Birthdays of the next DIAS_CUMPLEANOS days (today included) in the groups
 * where the person is Miembro or Colíder, without the person. A group whose
 * detail fails adds nothing; when the dates cannot be read the list is empty.
 */
export async function cargarCumpleanosGrupos(supabase: ClienteInicio, pedido: PedidoGruposMiembro): Promise<Cumpleanos[]> {
  if (pedido.grupos.length === 0) return []
  const grupos = await Promise.all(
    pedido.grupos.map(async (g) => {
      const detalle = await intentar(
        'obtener_detalle_grupo (cumpleaños)',
        async () => aDetalleCumpleanos(await datos(supabase.rpc('obtener_detalle_grupo', { p_auth_id: pedido.authId, p_grupo_id: g.grupoId }))),
        null,
      )
      return { contexto: detalle?.nombre ?? g.nombre, miembros: detalle?.miembros ?? [] }
    }),
  )

  // A person in two of the groups is listed once, under the first one.
  const personas = new Map<string, { nombre: string; contexto: string | null }>()
  for (const g of grupos) {
    for (const m of g.miembros) {
      if (m.id !== pedido.usuarioId && !personas.has(m.id)) personas.set(m.id, { nombre: m.nombre, contexto: g.contexto })
    }
  }
  if (personas.size === 0) return []

  const nacimientos = await intentar(
    'fechas de nacimiento del grupo',
    async () => filas(await datos(supabase.from('usuarios').select('id, fecha_nacimiento').in('id', [...personas.keys()]))),
    [],
  )
  return nacimientos
    .flatMap((f): Cumpleanos[] => {
      const id = texto(f.id)
      const persona = id ? personas.get(id) : undefined
      const nacimiento = texto(f.fecha_nacimiento)
      const fecha = nacimiento ? proximoCumpleanos(nacimiento, pedido.hoy) : null
      if (!id || !persona || !fecha || diasEntre(pedido.hoy, fecha) > DIAS_CUMPLEANOS) return []
      return [{ id, nombre: persona.nombre, fecha, contexto: persona.contexto }]
    })
    .sort(porFecha)
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
