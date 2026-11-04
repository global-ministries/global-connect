/**
 * Dream Team — "Pendientes" of a director (odd/tasks/dream-team-pendientes-director.md,
 * T3, S4, S5, S7): what is still missing in the caller's team.
 *
 * The database decides scope and alerts (20261106100000):
 * dream_team_pendientes_resumen() returns the counts (people, except áreas and
 * solicitudes), the urgentes and "% en orden"; dream_team_pendientes(p_tipo)
 * returns one row per alert, with what its action needs. No cédula, phone,
 * email or birth date ever arrives: only that it is missing. This module maps
 * both answers; the reads fail closed, like fetchSolicitudesCambioArea.
 */
import { DREAM_TEAM_ESTADOS, type DreamTeamEstado } from './types'

/** The alert tipos, in the order the screen reads them (the RPC's order). */
export const TIPOS_PENDIENTE = [
  'area_sin_servidores',
  'solicitud_cambio_area',
  'invitacion_vencida',
  'sin_cedula',
  'fecha_nacimiento',
  'sin_telefono',
  'genero_estado_civil',
  'sin_cuenta',
  'por_activar',
  'sin_turno',
] as const

export type TipoPendiente = (typeof TIPOS_PENDIENTE)[number]

/** Urgent per S7: they affect the next service or already expired. */
export const TIPOS_URGENTES: readonly TipoPendiente[] = ['area_sin_servidores', 'solicitud_cambio_area', 'invitacion_vencida']

/** The ficha fields of "Fichas incompletas" (Editar ficha). */
export const TIPOS_FICHA: readonly TipoPendiente[] = ['sin_cedula', 'fecha_nacimiento', 'sin_telefono', 'genero_estado_civil']

export const esTipoPendiente = (valor: unknown): valor is TipoPendiente =>
  typeof valor === 'string' && (TIPOS_PENDIENTE as readonly string[]).includes(valor)

/** Why a birth date is flagged: missing, in the future, the 1900-01-01 placeholder, before 1910. */
export type MotivoFechaNacimiento = 'falta' | 'futura' | 'marcador_1900' | 'anterior_1910'

/** The fields still "No especificado". */
export type CampoNoEspecificado = 'genero' | 'estado_civil'

/** The invitation state of a person without account, as Servidores derives it. */
export type InvitacionPendiente = 'sin_invitar' | 'enviada' | 'vencida'

export interface ResumenPendientes {
  readonly areasSinServidores: number
  /** Áreas considered (active leaves outside Grupos de Vida). */
  readonly areasTotal: number
  readonly sinCedula: number
  readonly fechaNacimiento: number
  readonly sinTelefono: number
  readonly generoEstadoCivil: number
  /** People with any ficha alert. */
  readonly fichasIncompletas: number
  /** People without account, the invitación vencida ones included. */
  readonly sinCuenta: number
  readonly invitacionesVencidas: number
  readonly porActivar: number
  readonly sinTurno: number
  readonly solicitudes: number
  /** Áreas sin servidores + solicitudes + invitaciones vencidas. */
  readonly urgentes: number
  readonly personasTotal: number
  /** People in scope with no person-level alert. */
  readonly personasEnOrden: number
  /** Rounded "% en orden"; `null` without people. */
  readonly porcentaje: number | null
}

interface FilaBase {
  /** `null` only for an área. */
  readonly personaId: string | null
  readonly personaNombre: string | null
  readonly equipoId: string
  /** Labels from the root down to the equipo. */
  readonly equipoRuta: readonly string[]
  /** Per-servicio tipos (por activar, sin turno, solicitud). */
  readonly servicioId: string | null
  readonly servicioEstado: DreamTeamEstado | null
  readonly servicioVersion: number | null
  /** Person-level tipos only; `null` elsewhere. */
  readonly tieneCuenta: boolean | null
  readonly tieneCorreo: boolean | null
  /** Whether the caller may open Editar ficha (person-level tipos). */
  readonly fichaEditable: boolean | null
  /** Whether the caller may invite (sin cuenta, invitación vencida). */
  readonly invitable: boolean | null
  /** Since when: entering the estado (por activar), the invitation sent, the request created. */
  readonly desde: string | null
}

export interface SolicitudPendiente {
  readonly id: string
  readonly destinoRuta: string
  readonly rolDestino: string
  readonly motivo: string
  readonly nota: string | null
  readonly solicitanteNombre: string
}

export type FilaPendiente = FilaBase &
  (
    | { readonly tipo: 'area_sin_servidores'; readonly porActivar: number }
    | { readonly tipo: 'fecha_nacimiento'; readonly motivo: MotivoFechaNacimiento }
    | { readonly tipo: 'genero_estado_civil'; readonly campos: readonly CampoNoEspecificado[] }
    /** `invitacion` is `null` when the caller may not invite (no invitation data). */
    | { readonly tipo: 'sin_cuenta'; readonly invitacion: InvitacionPendiente | null }
    | { readonly tipo: 'solicitud_cambio_area'; readonly solicitud: SolicitudPendiente }
    | { readonly tipo: 'sin_cedula' | 'sin_telefono' | 'invitacion_vencida' | 'por_activar' | 'sin_turno' }
  )

const SEPARADOR_RUTA = ' › '
const MOTIVOS_FECHA: readonly MotivoFechaNacimiento[] = ['falta', 'futura', 'marcador_1900', 'anterior_1910']
const INVITACIONES: readonly InvitacionPendiente[] = ['sin_invitar', 'enviada', 'vencida']

const texto = (v: unknown): string => (typeof v === 'string' ? v : '')
const textoONulo = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const booleanoONulo = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)
const entero = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0)
const enteroONulo = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null)
const uno = <T>(lista: readonly T[], v: unknown): T | undefined => lista.find((x) => x === v)

/** The single row of dream_team_pendientes_resumen(); `null` when there is none. */
export function mapResumenPendientes(data: unknown): ResumenPendientes | null {
  const f = (Array.isArray(data) ? data[0] : null) as Record<string, unknown> | null | undefined
  if (typeof f !== 'object' || f === null) return null
  const porcentaje = enteroONulo(f.porcentaje)
  return {
    areasSinServidores: entero(f.areas_sin_servidores),
    areasTotal: entero(f.areas_total),
    sinCedula: entero(f.sin_cedula),
    fechaNacimiento: entero(f.fecha_nacimiento),
    sinTelefono: entero(f.sin_telefono),
    generoEstadoCivil: entero(f.genero_estado_civil),
    fichasIncompletas: entero(f.fichas_incompletas),
    sinCuenta: entero(f.sin_cuenta),
    invitacionesVencidas: entero(f.invitaciones_vencidas),
    porActivar: entero(f.por_activar),
    sinTurno: entero(f.sin_turno),
    solicitudes: entero(f.solicitudes),
    urgentes: entero(f.urgentes),
    personasTotal: entero(f.personas_total),
    personasEnOrden: entero(f.personas_en_orden),
    porcentaje: porcentaje !== null && porcentaje >= 0 && porcentaje <= 100 ? porcentaje : null,
  }
}

function mapSolicitud(valor: unknown): SolicitudPendiente | null {
  const d = valor as Record<string, unknown> | null
  if (typeof d?.solicitud_id !== 'string') return null
  return {
    id: d.solicitud_id,
    destinoRuta: texto(d.destino_ruta),
    rolDestino: texto(d.rol_destino),
    motivo: texto(d.motivo),
    nota: textoONulo(d.nota),
    solicitanteNombre: texto(d.solicitante_nombre),
  }
}

function mapFila(fila: unknown): FilaPendiente[] {
  const f = fila as Record<string, unknown> | null
  if (!esTipoPendiente(f?.tipo) || typeof f.equipo_id !== 'string') return []
  const personaId = textoONulo(f.persona_id)
  if (f.tipo !== 'area_sin_servidores' && personaId === null) return []
  const base: FilaBase = {
    personaId,
    personaNombre: textoONulo(f.persona_nombre),
    equipoId: f.equipo_id,
    equipoRuta: texto(f.equipo_ruta).split(SEPARADOR_RUTA).filter(Boolean),
    servicioId: textoONulo(f.servicio_id),
    servicioEstado: uno(DREAM_TEAM_ESTADOS, f.servicio_estado) ?? null,
    servicioVersion: enteroONulo(f.servicio_version),
    tieneCuenta: booleanoONulo(f.tiene_cuenta),
    tieneCorreo: booleanoONulo(f.tiene_correo),
    fichaEditable: booleanoONulo(f.ficha_editable),
    invitable: booleanoONulo(f.invitable),
    desde: textoONulo(f.desde),
  }
  const detalle = (typeof f.detalle === 'object' && f.detalle !== null ? f.detalle : {}) as Record<string, unknown>
  switch (f.tipo) {
    case 'area_sin_servidores':
      return [{ ...base, tipo: f.tipo, porActivar: entero(detalle.por_activar) }]
    case 'fecha_nacimiento': {
      const motivo = uno(MOTIVOS_FECHA, detalle.motivo)
      return motivo ? [{ ...base, tipo: f.tipo, motivo }] : []
    }
    case 'genero_estado_civil': {
      const campos = Array.isArray(detalle.campos)
        ? detalle.campos.filter((c): c is CampoNoEspecificado => c === 'genero' || c === 'estado_civil')
        : []
      return campos.length > 0 ? [{ ...base, tipo: f.tipo, campos }] : []
    }
    case 'sin_cuenta':
      return [{ ...base, tipo: f.tipo, invitacion: uno(INVITACIONES, detalle.invitacion) ?? null }]
    case 'solicitud_cambio_area': {
      const solicitud = mapSolicitud(detalle)
      return solicitud ? [{ ...base, tipo: f.tipo, solicitud }] : []
    }
    default:
      return [{ ...base, tipo: f.tipo }]
  }
}

/** The rows of dream_team_pendientes(); malformed rows are dropped, order kept. */
export function mapFilasPendientes(data: unknown): FilaPendiente[] {
  return Array.isArray(data) ? data.flatMap(mapFila) : []
}

// Not in the generated database types yet: untyped, as cambiar-area.ts.
type RpcSinTipos = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>

async function llamar(supabase: { rpc?: unknown }, fn: string, args?: Record<string, unknown>): Promise<unknown> {
  if (typeof supabase.rpc !== 'function') return null
  try {
    const { data, error } = await (supabase.rpc as RpcSinTipos).call(supabase, fn, args)
    return error ? null : data
  } catch {
    return null
  }
}

/** The caller's summary; `null` when the read fails. */
export async function fetchResumenPendientes(supabase: { rpc?: unknown }): Promise<ResumenPendientes | null> {
  return mapResumenPendientes(await llamar(supabase, 'dream_team_pendientes_resumen'))
}

/** The caller's alert rows (all, or one tipo); none when the read fails. */
export async function fetchPendientes(supabase: { rpc?: unknown }, tipo?: TipoPendiente): Promise<FilaPendiente[]> {
  return mapFilasPendientes(await llamar(supabase, 'dream_team_pendientes', tipo ? { p_tipo: tipo } : undefined))
}
