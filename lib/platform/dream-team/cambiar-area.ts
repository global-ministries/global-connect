/**
 * Dream Team — "Cambiar de área" (odd/tasks/dream-team-cambiar-area.md, T2,
 * T3, S3, S5 and S7): a director moves a servicio to another área in one step,
 * or sends a request that a director of both áreas (or the Atención al
 * Voluntario coordinator of the dirección) approves; a coordinator always
 * sends a request.
 *
 * The database is the one authority (20261104100000, 20261104110000,
 * 20261104120000):
 * dream_team_cambiar_area_destinos lists the áreas with `dirige` (move
 * directly) or not (send a request), dream_team_cambiar_area and
 * dream_team_solicitar_cambio_area apply each, and
 * dream_team_solicitudes_cambio_area / dream_team_resolver_solicitud_cambio_area
 * list and resolve the requests. This module validates the bodies, maps the
 * RPC rows and errors (their Spanish messages are written for the UI), and
 * picks the default rol of a destination.
 */
import { esUuid } from './alta-persona'
import { esNivelRol } from './nivel-rol'
import type { DreamTeamNivelRol } from './types'

export type MotivoCambioArea = 'correccion' | 'traslado'

export const MOTIVOS_CAMBIO_AREA: readonly { readonly valor: MotivoCambioArea; readonly etiqueta: string }[] = [
  { valor: 'correccion', etiqueta: 'Corrección (estaba mal cargado)' },
  { valor: 'traslado', etiqueta: 'Traslado (cambia de área)' },
]

export const MOTIVO_CAMBIO_AREA_LABELS: Readonly<Record<MotivoCambioArea, string>> = {
  correccion: 'Corrección',
  traslado: 'Traslado',
}

export const NOTA_CAMBIO_AREA_MAX = 500

export interface RolDestino {
  readonly id: string
  readonly label: string
  readonly nivel: DreamTeamNivelRol
}

export interface DestinoCambioArea {
  readonly equipoId: string
  /** Labels from the root down to the equipo. */
  readonly ruta: readonly string[]
  readonly experiencia: string
  /** The caller directs it: the move is direct; otherwise it is a request. */
  readonly dirige: boolean
  readonly roles: readonly RolDestino[]
}

export type EstadoSolicitudCambioArea = 'pendiente' | 'aprobada' | 'rechazada' | 'anulada'

export interface SolicitudCambioArea {
  readonly id: string
  readonly estado: EstadoSolicitudCambioArea
  readonly puedeResolver: boolean
  readonly esMia: boolean
  readonly personaNombre: string
  readonly origenRuta: string
  readonly rolOrigen: string
  readonly destinoRuta: string
  readonly rolDestino: string
  readonly motivo: MotivoCambioArea
  readonly nota: string | null
  readonly solicitanteNombre: string
  readonly respuesta: string | null
  readonly resueltoPorNombre: string | null
  readonly creadaEn: string
  readonly resueltaEn: string | null
}

export const ESTADO_SOLICITUD_LABELS: Readonly<Record<EstadoSolicitudCambioArea, string>> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  anulada: 'Anulada',
}

const SEPARADOR_RUTA = ' › '

const texto = (v: unknown): string => (typeof v === 'string' ? v : '')
const textoONulo = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

function mapRol(valor: unknown): RolDestino[] {
  const r = valor as { id?: unknown; label?: unknown; nivel?: unknown } | null
  if (typeof r?.id !== 'string' || typeof r.label !== 'string') return []
  return [{ id: r.id, label: r.label, nivel: esNivelRol(r.nivel) ? r.nivel : 'voluntario' }]
}

/** The rows of dream_team_cambiar_area_destinos. */
export function mapDestinos(data: unknown): DestinoCambioArea[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((fila): DestinoCambioArea[] => {
    const f = fila as Record<string, unknown> | null
    if (typeof f?.equipo_id !== 'string') return []
    return [
      {
        equipoId: f.equipo_id,
        ruta: texto(f.ruta).split(SEPARADOR_RUTA).filter(Boolean),
        experiencia: texto(f.experiencia),
        dirige: f.dirige === true,
        roles: Array.isArray(f.roles) ? f.roles.flatMap(mapRol) : [],
      },
    ]
  })
}

const ESTADOS: readonly EstadoSolicitudCambioArea[] = ['pendiente', 'aprobada', 'rechazada', 'anulada']

/** The rows of dream_team_solicitudes_cambio_area(). */
export function mapSolicitudes(data: unknown): SolicitudCambioArea[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((fila): SolicitudCambioArea[] => {
    const f = fila as Record<string, unknown> | null
    if (typeof f?.id !== 'string') return []
    const estado = ESTADOS.find((e) => e === f.estado)
    const motivo = f.motivo === 'correccion' || f.motivo === 'traslado' ? f.motivo : null
    if (!estado || !motivo) return []
    return [
      {
        id: f.id,
        estado,
        puedeResolver: f.puede_resolver === true,
        esMia: f.es_mia === true,
        personaNombre: texto(f.persona_nombre),
        origenRuta: texto(f.origen_ruta),
        rolOrigen: texto(f.rol_origen),
        destinoRuta: texto(f.destino_ruta),
        rolDestino: texto(f.rol_destino),
        motivo,
        nota: textoONulo(f.nota),
        solicitanteNombre: texto(f.solicitante_nombre),
        respuesta: textoONulo(f.respuesta),
        resueltoPorNombre: textoONulo(f.resuelto_por_nombre),
        creadaEn: texto(f.created_at),
        resueltaEn: textoONulo(f.resuelto_at),
      },
    ]
  })
}

/** The destination rol the dialog proposes: the first with the current rol's nivel, else none. */
export function rolInicial(destino: DestinoCambioArea | undefined, nivelActual: DreamTeamNivelRol | null): string {
  if (!destino || nivelActual === null) return ''
  return destino.roles.find((rol) => rol.nivel === nivelActual)?.id ?? ''
}

export interface CuerpoCambioArea {
  /** `directo` calls dream_team_cambiar_area, `solicitud` dream_team_solicitar_cambio_area. */
  readonly modo: 'directo' | 'solicitud'
  readonly equipoId: string
  readonly rolId: string
  readonly motivo: MotivoCambioArea
  readonly nota: string | null
}

/** Validates POST /api/dream-team/servicios/[id]/cambiar-area. */
export function parseCambioArea(body: unknown): { readonly datos: CuerpoCambioArea } | { readonly error: string } {
  const b = (body ?? {}) as Record<string, unknown>
  if (b.modo !== 'directo' && b.modo !== 'solicitud') return { error: 'Modo inválido' }
  if (!esUuid(b.equipoId)) return { error: 'Elige el área destino.' }
  if (!esUuid(b.rolId)) return { error: 'Elige el rol en el área destino.' }
  if (b.motivo !== 'correccion' && b.motivo !== 'traslado') return { error: 'Elige el motivo: Corrección o Traslado.' }
  if (b.nota !== undefined && b.nota !== null && typeof b.nota !== 'string') return { error: 'Nota inválida' }
  const nota = typeof b.nota === 'string' ? b.nota.trim() : ''
  if (nota.length > NOTA_CAMBIO_AREA_MAX) return { error: `La nota admite hasta ${NOTA_CAMBIO_AREA_MAX} caracteres.` }
  return { datos: { modo: b.modo, equipoId: b.equipoId, rolId: b.rolId, motivo: b.motivo, nota: nota || null } }
}

/** Validates POST /api/dream-team/solicitudes-cambio-area/[id]. */
export function parseResolverSolicitud(
  body: unknown,
): { readonly aprobar: boolean; readonly respuesta: string | null } | { readonly error: string } {
  const b = (body ?? {}) as Record<string, unknown>
  if (typeof b.aprobar !== 'boolean') return { error: 'Indica si apruebas o rechazas la solicitud.' }
  if (b.respuesta !== undefined && b.respuesta !== null && typeof b.respuesta !== 'string') return { error: 'Respuesta inválida' }
  const respuesta = typeof b.respuesta === 'string' ? b.respuesta.trim() : ''
  if (respuesta.length > NOTA_CAMBIO_AREA_MAX) return { error: `La respuesta admite hasta ${NOTA_CAMBIO_AREA_MAX} caracteres.` }
  return { aprobar: b.aprobar, respuesta: respuesta || null }
}

/**
 * An RPC error as an HTTP answer. 42501 and 22023 carry the Spanish message
 * the migration wrote for the UI; anything else is a 500 without detail.
 */
export function mapCambioAreaError(error: { code?: string; message?: string }): {
  readonly status: 403 | 422 | 500
  readonly error: string
} {
  if (error.code === '42501') return { status: 403, error: error.message || 'Permiso denegado' }
  if (error.code === '22023') return { status: 422, error: error.message || 'Datos inválidos' }
  return { status: 500, error: 'Error interno' }
}

// The functions are not in the generated database types yet, so the calls are
// untyped (the pattern of app/api/dream-team/personas/[id]/ficha/route.ts).
type RpcSinTipos = (fn: string, args?: Record<string, unknown>) => PromiseLike<{
  data: unknown
  error: { code?: string; message?: string } | null
}>

/** Calls one of the cambiar-área RPCs on a server client. */
export function rpcCambioArea(supabase: { rpc: unknown }): RpcSinTipos {
  return (supabase.rpc as (...a: unknown[]) => ReturnType<RpcSinTipos>).bind(supabase) as RpcSinTipos
}

/**
 * The requests of dream_team_solicitudes_cambio_area() for a server page: the
 * pending ones the caller resolves and the caller's own. A convenience on top
 * of the screen that fails closed, as fetchEquiposRegistrables: any failure
 * is none.
 */
export async function fetchSolicitudesCambioArea(supabase: { rpc?: unknown }): Promise<SolicitudCambioArea[]> {
  if (typeof supabase.rpc !== 'function') return []
  try {
    const { data, error } = await rpcCambioArea(supabase as { rpc: unknown })('dream_team_solicitudes_cambio_area')
    return error ? [] : mapSolicitudes(data)
  } catch {
    return []
  }
}

type RpcPuedeSolicitar = (fn: 'dream_team_puede_solicitar_cambio_area', args: { p_equipo_id: string }) => PromiseLike<{
  data: unknown
  error: unknown
}>

/**
 * The equipos (of `equipoIds`) whose servicios the caller may change the área
 * of (dream_team_puede_solicitar_cambio_area: director authority, or
 * dream_team.coordinate for a request): where "Cambiar de área" shows. One
 * call per distinct equipo, as the pages already read roles per equipo. Fails
 * closed: an error or a non-true answer is "no".
 */
export async function fetchEquiposCambioArea(
  supabase: { rpc?: unknown },
  equipoIds: readonly string[],
): Promise<ReadonlySet<string>> {
  if (typeof supabase.rpc !== 'function') return new Set()
  const rpc = (supabase.rpc as RpcPuedeSolicitar).bind(supabase)
  const unicos = [...new Set(equipoIds)]
  const respuestas = await Promise.all(
    unicos.map(async (id) => {
      try {
        const { data, error } = await rpc('dream_team_puede_solicitar_cambio_area', { p_equipo_id: id })
        return !error && data === true ? id : null
      } catch {
        return null
      }
    }),
  )
  return new Set(respuestas.filter((id): id is string => id !== null))
}
