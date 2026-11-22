/**
 * Dream Team — who reshapes which equipos on /admin/dream-team/estructura and
 * how «Mover a…» reads (odd/tasks/dream-team-estructura-correcciones.md, T3,
 * S4, S5). Pure and client-safe.
 *
 * The database is the authority: dream_team_gestiona_equipo and the
 * dream_team_equipo_crear / _renombrar / _cambiar_activo / _mover RPCs
 * (supabase/migrations/20261121100000_dream_team_equipos_gestion.sql).
 * equiposQueGestiona mirrors that gate so the screen only offers what they
 * accept: directors and up — dream_team.direct or dream_team.org.manage on the
 * equipo or an ancestor (no scope = every equipo), or an admin or pastor.
 * dream_team.director.coordinate and coordinators get nothing here.
 */
import type { NodoOrganigrama } from './estructura-organigrama'
import type { DreamTeamEquipo } from './types'

export const CAPACIDADES_GESTION_EQUIPOS: readonly string[] = ['dream_team.direct', 'dream_team.org.manage']
export const ROLES_GESTION_EQUIPOS: readonly string[] = ['admin', 'pastor']

export interface AutoridadGestion {
  readonly capabilities: readonly { readonly key: string; readonly scopeId?: string }[]
  readonly globalRoles?: readonly string[]
}

export interface EquipoParaGestion {
  readonly id: string
  readonly parentEquipoId?: string
}

const esGlobal = (autoridad: AutoridadGestion): boolean =>
  (autoridad.globalRoles ?? []).some((rol) => ROLES_GESTION_EQUIPOS.includes(rol)) ||
  autoridad.capabilities.some((c) => CAPACIDADES_GESTION_EQUIPOS.includes(c.key) && !c.scopeId)

/** Coarse gate of the equipo actions: the viewer directs some equipo (the RPC decides which). */
export function gestionaAlgunEquipo(autoridad: AutoridadGestion): boolean {
  return esGlobal(autoridad) || autoridad.capabilities.some((c) => CAPACIDADES_GESTION_EQUIPOS.includes(c.key))
}

/** The ids of `equipos` the viewer may reshape, in the order given. */
export function equiposQueGestiona(autoridad: AutoridadGestion, equipos: readonly EquipoParaGestion[]): string[] {
  if (esGlobal(autoridad)) return equipos.map((equipo) => equipo.id)

  const hijos = new Map<string, string[]>()
  for (const equipo of equipos) {
    if (!equipo.parentEquipoId) continue
    hijos.set(equipo.parentEquipoId, [...(hijos.get(equipo.parentEquipoId) ?? []), equipo.id])
  }
  const visibles = new Set(equipos.map((equipo) => equipo.id))
  const alcance = new Set<string>()
  const pendientes = autoridad.capabilities
    .filter((c) => CAPACIDADES_GESTION_EQUIPOS.includes(c.key) && c.scopeId && visibles.has(c.scopeId))
    .map((c) => c.scopeId as string)
  while (pendientes.length > 0) {
    const id = pendientes.pop() as string
    if (alcance.has(id)) continue
    alcance.add(id)
    pendientes.push(...(hijos.get(id) ?? []))
  }
  return equipos.filter((equipo) => alcance.has(equipo.id)).map((equipo) => equipo.id)
}

// ── «Mover a…» ─────────────────────────────────────────────────────────

export interface DestinoMover {
  readonly id: string
  readonly label: string
  /** Labels from the root down to this equipo (its own last). */
  readonly ruta: readonly string[]
  readonly profundidad: number
}

/**
 * Where `equipoId` may go: every active, real (not Grupos de Vida) equipo the
 * viewer manages, except itself, its subtree (a cycle) and its current
 * parent. `nodos` in pre-order, as the organigrama lists them.
 */
export function destinosMover(
  nodos: readonly NodoOrganigrama[],
  equipoId: string,
  gestionables: ReadonlySet<string>,
): DestinoMover[] {
  const porId = new Map(nodos.map((nodo) => [nodo.id, nodo]))
  const actual = porId.get(equipoId)
  const hijos = new Map<string, string[]>()
  for (const nodo of nodos) {
    if (nodo.padreId) hijos.set(nodo.padreId, [...(hijos.get(nodo.padreId) ?? []), nodo.id])
  }
  const subarbol = new Set<string>()
  const pendientes = [equipoId]
  while (pendientes.length > 0) {
    const id = pendientes.pop() as string
    if (subarbol.has(id)) continue
    subarbol.add(id)
    pendientes.push(...(hijos.get(id) ?? []))
  }
  const ruta = (nodo: NodoOrganigrama): string[] => {
    const labels: string[] = []
    for (let n: NodoOrganigrama | undefined = nodo; n && labels.length <= 16; n = n.padreId ? porId.get(n.padreId) : undefined) {
      labels.unshift(n.label)
    }
    return labels
  }
  return nodos
    .filter(
      (nodo) =>
        nodo.editable && nodo.activo && gestionables.has(nodo.id) && !subarbol.has(nodo.id) && nodo.id !== actual?.padreId,
    )
    .map((nodo) => ({ id: nodo.id, label: nodo.label, ruta: ruta(nodo), profundidad: nodo.profundidad }))
}

const normalizar = (texto: string): string =>
  texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

/** The destinations whose name contains `q`, ignoring case and accents. */
export function buscarDestinos(destinos: readonly DestinoMover[], q: string): readonly DestinoMover[] {
  const consulta = normalizar(q)
  if (!consulta) return destinos
  return destinos.filter((destino) => normalizar(destino.label).includes(consulta))
}

export interface ResumenMover {
  readonly equipo: string
  readonly origen: string
  readonly destino: string
  /** Every equipo below it. */
  readonly subequipos: number
  /** People serving in it and below. */
  readonly personas: number
}

/** The confirmation of «Mover a…»: title, origin and destination, what moves with it. */
export function confirmacionMover(resumen: ResumenMover): {
  readonly titulo: string
  readonly origenDestino: string
  readonly arrastra: string
} {
  const { equipo, origen, destino, subequipos, personas } = resumen
  const partes = [
    subequipos > 0 ? (subequipos === 1 ? '1 subequipo' : `${subequipos} subequipos`) : null,
    personas > 0 ? (personas === 1 ? '1 persona' : `${personas} personas`) : null,
  ].filter((parte): parte is string => parte !== null)
  const verbo = subequipos + personas === 1 ? 'mueve' : 'mueven'
  const siguen =
    personas === 0 ? '.' : personas === 1 ? '; sigue en su equipo con su rol.' : '; todos siguen en sus equipos con sus roles.'
  return {
    titulo: `¿Mover «${equipo}»?`,
    origenDestino: `Pasará de «${origen}» a «${destino}».`,
    arrastra: partes.length === 0 ? 'No tiene subequipos ni personas.' : `Con él se ${verbo} ${partes.join(' y ')}${siguen}`,
  }
}

// ── RPC answers ────────────────────────────────────────────────────────

export type AccionGestion = 'crear' | 'renombrar' | 'activar' | 'mover'
export type ErrorGestion = 'forbidden' | 'not-found' | 'unauthorized' | 'invalid-input' | 'internal'

const MENSAJE_INTERNO = 'No pudimos guardar el cambio. Inténtalo de nuevo.'

const MENSAJES: Readonly<Record<string, string>> = {
  sin_sesion: 'Tu sesión expiró. Inicia sesión nuevamente.',
  sin_autoridad: 'No diriges este equipo ni uno superior, así que no puedes cambiarlo.',
  padre_invalido: 'El equipo de arriba ya no existe. Recarga la página.',
  equipo_invalido: 'Este equipo ya no existe. Recarga la página.',
  destino_invalido: 'El equipo destino no existe o está inactivo. Elige otro.',
  nombre_invalido: 'Escribe un nombre de 1 a 120 caracteres.',
  nombre_repetido: 'Ya hay un equipo con ese nombre en ese lugar (puede estar inactivo). Elige otro nombre.',
  activo_invalido: 'Los datos ingresados no son válidos.',
  equipo_raiz: 'Una dirección principal no se puede mover.',
  mismo_padre: 'El equipo ya está ahí. Elige otro destino.',
  ciclo: 'No puedes moverlo dentro de sí mismo ni de uno de sus subequipos.',
  equipo_ancla: 'Este equipo sostiene la planificación de DPS y no se puede mover.',
  experiencia_con_datos:
    'Este equipo o uno de sus subequipos tiene talleres, grupos de Estudiantes o salones de Niños y no puede pasar a otra área. Pide ayuda a un administrador.',
  dps_convocados_pendientes:
    'Hay personas convocadas en planes de DPS de hoy en adelante en este equipo. Quítalas de esos planes antes de sacarlo de DPS.',
}

/** The Spanish («tú») message of a dream_team_equipo_* error code. */
export function mensajeErrorGestion(codigo: string, accion: AccionGestion): string {
  if (codigo === 'sin_autoridad' && accion === 'mover') {
    return 'Para moverlo tienes que dirigir el equipo donde está y el equipo destino (o uno superior a cada uno).'
  }
  if (codigo === 'equipo_ancla' && accion === 'activar') {
    return 'Este equipo sostiene la planificación de DPS y no se puede desactivar.'
  }
  if (codigo === 'equipo_ancla' && accion === 'renombrar') {
    return 'Este equipo sostiene la planificación de DPS y no se puede renombrar.'
  }
  return MENSAJES[codigo] ?? MENSAJE_INTERNO
}

export type ResultadoRpcEquipo =
  | { readonly ok: true; readonly equipo: DreamTeamEquipo; readonly ruta?: string }
  | { readonly ok: false; readonly error: ErrorGestion; readonly message: string }

function errorDe(codigoSql: string | undefined, codigo: string): ErrorGestion {
  if (codigoSql === '42501') return codigo === 'sin_sesion' ? 'unauthorized' : 'forbidden'
  if (codigoSql === '22023') return codigo === 'equipo_invalido' || codigo === 'padre_invalido' ? 'not-found' : 'invalid-input'
  return 'internal'
}

/** The answer of a dream_team_equipo_* RPC as an action result. */
export function resultadoRpcEquipo(
  respuesta: { readonly data: unknown; readonly error: { readonly code?: string; readonly message?: string } | null },
  accion: AccionGestion,
): ResultadoRpcEquipo {
  if (respuesta.error) {
    const codigo = respuesta.error.message ?? ''
    const error = errorDe(respuesta.error.code, codigo)
    return { ok: false, error, message: error === 'internal' ? MENSAJE_INTERNO : mensajeErrorGestion(codigo, accion) }
  }
  const fila = respuesta.data as Record<string, unknown> | null
  if (typeof fila?.id !== 'string' || typeof fila.label !== 'string' || typeof fila.experiencia !== 'string') {
    return { ok: false, error: 'internal', message: MENSAJE_INTERNO }
  }
  const equipo: DreamTeamEquipo = {
    id: fila.id,
    experiencia: fila.experiencia as DreamTeamEquipo['experiencia'],
    ...(typeof fila.parent_equipo_id === 'string' ? { parentEquipoId: fila.parent_equipo_id } : {}),
    label: fila.label,
    activo: fila.activo === true,
  }
  return typeof fila.ruta === 'string' ? { ok: true, equipo, ruta: fila.ruta } : { ok: true, equipo }
}
