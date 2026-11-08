'use server'

/**
 * DPS — server actions of Plan del domingo · Equipos (/dps/plan, T10 of
 * odd/tasks/dps-asistencia-pco.md; S6.2, S6.4, S7.4): reload the teams,
 * search the candidates of a puesto, convocar / quitar, find the previous
 * plan, "Copiar del domingo anterior", and change or remove the series
 * cover. The client applies the changes in place, so nothing is revalidated.
 *
 * Gate: an authenticated session only. Every RPC goes through the session
 * client, so the database decides who sees and who edits and who may be
 * convocado where (supabase/migrations/20261108202000_dps_planificacion_convocados.sql
 * and 20261108201000_dps_planificacion_rpcs.sql), raising its code as the
 * message; the Spanish texts are in lib/platform/dps/errores.ts.
 *
 * The cover: the dps-series bucket has no storage policies, so the file is
 * uploaded with the service role (lib/actions/photo.actions.ts pattern) —
 * only after checking its type by its bytes, its size (the bucket's 5 MB)
 * and that the caller edits the plan — at '<serie_id>/<timestamp>.<ext>';
 * then dps_serie_imagen saves it with the USER's client, so the RPC has the
 * last word. If it refuses, the uploaded file is deleted. The old cover is
 * deleted only after the new one is saved, and only inside its series'
 * folder.
 */

import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { codigoErrorDps, mensajeErrorDps, type CodigoErrorDps, type ContextoErrorDps, type ErrorRpc } from '@/lib/platform/dps/errores'
import {
  BUCKET_SERIES,
  leerCandidatos,
  leerEquiposPlan,
  leerPlanCabecera,
  urlPortada,
  type CandidatoPuesto,
  type EquiposPlan,
  type PlanCabecera,
  type SerieCabecera,
} from '@/lib/platform/dps/plan'
import { rpcDps, type RpcDps } from '@/lib/platform/dps/rpc'

import type { ResultadoDps } from './dps-asistencia.actions'

const SIN_SESION = 'Tu sesión terminó. Vuelve a iniciar sesión.'
const DATOS_INVALIDOS = 'Revisa los datos e inténtalo de nuevo.'
const SIN_SERIE = 'Este plan no es de una serie: no tiene portada.'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** dps_candidatos_puesto refuses longer searches ('busqueda_invalida'). */
const MAX_BUSQUEDA = 100
/** The dps-series bucket's file_size_limit. */
const MAX_IMAGEN = 5 * 1024 * 1024

const esUuid = (valor: unknown): valor is string => typeof valor === 'string' && UUID_RE.test(valor)
const fallo = (message: string, codigo: CodigoErrorDps | null = null) => ({ ok: false, message, codigo }) as const
const falloRpc = (error: ErrorRpc, contexto: ContextoErrorDps) => fallo(mensajeErrorDps(error, contexto), codigoErrorDps(error))

async function sesion(): Promise<{ rpc: RpcDps } | null> {
  const cliente = await createSupabaseServerClient()
  const {
    data: { user },
  } = await cliente.auth.getUser()
  return user ? { rpc: rpcDps(cliente) } : null
}

/** The teams, puestos and convocados of the plan (dps_plan_equipos). */
export async function cargarEquiposDps(input: { readonly planId: string }): Promise<ResultadoDps<EquiposPlan>> {
  if (!esUuid(input?.planId)) return fallo(DATOS_INVALIDOS)
  const s = await sesion()
  if (!s) return fallo(SIN_SESION)

  const { data, error } = await s.rpc('dps_plan_equipos', { p_plan_id: input.planId })
  if (error) return falloRpc(error, 'plan')
  return { ok: true, data: leerEquiposPlan(data) }
}

export interface BuscarCandidatosInput {
  readonly planId: string
  readonly puestoId: string
  readonly busqueda: string
}

/** Active servicios of the puesto's team subtree, with what they already do that day. */
export async function buscarCandidatosDps(input: BuscarCandidatosInput): Promise<ResultadoDps<CandidatoPuesto[]>> {
  if (!esUuid(input?.planId) || !esUuid(input?.puestoId) || typeof input.busqueda !== 'string') return fallo(DATOS_INVALIDOS)
  const busqueda = input.busqueda.trim()
  if (busqueda.length > MAX_BUSQUEDA) return falloRpc({ message: 'busqueda_invalida' }, 'equipos')
  const s = await sesion()
  if (!s) return fallo(SIN_SESION)

  const { data, error } = await s.rpc('dps_candidatos_puesto', { p_puesto_id: input.puestoId, p_plan_id: input.planId, p_busqueda: busqueda || null })
  if (error) return falloRpc(error, 'equipos')
  return { ok: true, data: leerCandidatos(data) }
}

export interface ConvocarInput {
  readonly planId: string
  readonly puestoId: string
  readonly servicioId: string
}

export async function convocarDps(input: ConvocarInput): Promise<ResultadoDps<{ readonly convocadoId: string }>> {
  if (!esUuid(input?.planId) || !esUuid(input?.puestoId) || !esUuid(input?.servicioId)) return fallo(DATOS_INVALIDOS)
  const s = await sesion()
  if (!s) return fallo(SIN_SESION)

  const { data, error } = await s.rpc('dps_convocar', { p_plan_id: input.planId, p_puesto_id: input.puestoId, p_servicio_id: input.servicioId })
  if (error) return falloRpc(error, 'equipos')
  return { ok: true, data: { convocadoId: typeof data === 'string' ? data : '' } }
}

export interface DesconvocarInput {
  readonly planId: string
  readonly puestoId: string
  readonly personaId: string
}

export async function desconvocarDps(input: DesconvocarInput): Promise<ResultadoDps<{ readonly quitado: boolean }>> {
  if (!esUuid(input?.planId) || !esUuid(input?.puestoId) || !esUuid(input?.personaId)) return fallo(DATOS_INVALIDOS)
  const s = await sesion()
  if (!s) return fallo(SIN_SESION)

  const { data, error } = await s.rpc('dps_desconvocar', { p_plan_id: input.planId, p_puesto_id: input.puestoId, p_persona_id: input.personaId })
  if (error) return falloRpc(error, 'equipos')
  return { ok: true, data: { quitado: data === true } }
}

/** The plan before this one of the same tipo (dps_plan_anterior), read for the confirmation; null when none. */
export async function planAnteriorDps(input: { readonly planId: string }): Promise<ResultadoDps<PlanCabecera | null>> {
  if (!esUuid(input?.planId)) return fallo(DATOS_INVALIDOS)
  const s = await sesion()
  if (!s) return fallo(SIN_SESION)

  const anterior = await s.rpc('dps_plan_anterior', { p_plan_id: input.planId })
  if (anterior.error) return falloRpc(anterior.error, 'equipos')
  if (!esUuid(anterior.data)) return { ok: true, data: null }
  const leido = await s.rpc('dps_plan_leer', { p_plan_id: anterior.data })
  if (leido.error) return falloRpc(leido.error, 'equipos')
  return { ok: true, data: leerPlanCabecera(leido.data) }
}

export interface CopiarPlanInput {
  readonly origenId: string
  readonly destinoId: string
  /** Without it, a plan that already has convocados answers 'destino_con_convocados'. */
  readonly reemplazar: boolean
}

export async function copiarPlanDps(input: CopiarPlanInput): Promise<ResultadoDps<{ readonly copiados: number; readonly omitidos: number }>> {
  if (!esUuid(input?.origenId) || !esUuid(input?.destinoId) || input.origenId === input.destinoId || typeof input.reemplazar !== 'boolean') {
    return fallo(DATOS_INVALIDOS)
  }
  const s = await sesion()
  if (!s) return fallo(SIN_SESION)

  const { data, error } = await s.rpc('dps_copiar_plan', { p_origen_id: input.origenId, p_destino_id: input.destinoId, p_reemplazar: input.reemplazar })
  if (error) return falloRpc(error, 'equipos')
  const r = (data ?? {}) as { copiados?: unknown; omitidos?: unknown }
  const numero = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
  return { ok: true, data: { copiados: numero(r.copiados), omitidos: numero(r.omitidos) } }
}

export interface PortadaDps {
  readonly imagenPath: string | null
  readonly url: string | null
}

const FIRMAS: readonly { readonly tipo: string; readonly ext: string; readonly es: (b: Uint8Array) => boolean }[] = [
  { tipo: 'image/jpeg', ext: 'jpg', es: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { tipo: 'image/png', ext: 'png', es: (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x) },
  {
    tipo: 'image/webp',
    ext: 'webp',
    es: (b) => String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP',
  },
]

/** The file, when it is a jpeg / png / webp of at most 5 MB whose bytes match its declared type. */
async function leerImagen(valor: FormDataEntryValue | null): Promise<{ bytes: Uint8Array; tipo: string; ext: string } | null> {
  if (!(valor instanceof Blob) || valor.size === 0 || valor.size > MAX_IMAGEN) return null
  const firma = FIRMAS.find((f) => f.tipo === valor.type)
  if (!firma) return null
  const bytes = new Uint8Array(await valor.arrayBuffer())
  return firma.es(bytes) ? { bytes, tipo: firma.tipo, ext: firma.ext } : null
}

type Fallo = Extract<ResultadoDps<never>, { ok: false }>

/** The plan's series and current cover, when the caller edits the plan. */
async function serieEditable(rpc: RpcDps, planId: string): Promise<{ readonly serie: SerieCabecera } | { readonly error: Fallo }> {
  const { data, error } = await rpc('dps_plan_leer', { p_plan_id: planId })
  if (error) return { error: falloRpc(error, 'portada') }
  const plan = leerPlanCabecera(data)
  if (!plan?.serie) return { error: fallo(SIN_SERIE, 'serie_invalida') }
  if ((data as { puede_editar?: unknown }).puede_editar !== true) return { error: falloRpc({ message: 'sin_autoridad' }, 'portada') }
  return { serie: plan.serie }
}

/** Best effort: a leftover file is harmless, so a failed removal never fails the action. */
async function borrarArchivos(rutas: readonly string[]): Promise<void> {
  try {
    await createSupabaseAdminClient().storage.from(BUCKET_SERIES).remove([...rutas])
  } catch {
    // ignored: see above
  }
}

const anteriorBorrable = (anterior: string | null, serieId: string, nueva: string | null): anterior is string =>
  Boolean(anterior) && anterior !== nueva && anterior!.startsWith(`${serieId}/`) && !anterior!.includes('..')

/** "Cambiar portada": FormData with `planId` and the `imagen` file. */
export async function cambiarPortadaDps(datos: FormData): Promise<ResultadoDps<PortadaDps>> {
  const planId = datos?.get('planId')
  if (!esUuid(planId)) return fallo(DATOS_INVALIDOS)
  const imagen = await leerImagen(datos.get('imagen'))
  if (!imagen) return falloRpc({ message: 'imagen_invalida' }, 'portada')
  const s = await sesion()
  if (!s) return fallo(SIN_SESION)

  const leida = await serieEditable(s.rpc, planId)
  if ('error' in leida) return leida.error
  const { serie } = leida

  const ruta = `${serie.id}/${Date.now()}.${imagen.ext}`
  let subida: { error: unknown }
  try {
    subida = await createSupabaseAdminClient()
      .storage.from(BUCKET_SERIES)
      .upload(ruta, imagen.bytes, { contentType: imagen.tipo, cacheControl: '3600', upsert: false })
  } catch (error) {
    subida = { error }
  }
  if (subida.error) return falloRpc({ message: null }, 'portada')

  const { error } = await s.rpc('dps_serie_imagen', { p_serie_id: serie.id, p_path: ruta })
  if (error) {
    await borrarArchivos([ruta])
    return falloRpc(error, 'portada')
  }
  if (anteriorBorrable(serie.imagenPath, serie.id, ruta)) await borrarArchivos([serie.imagenPath])
  return { ok: true, data: { imagenPath: ruta, url: urlPortada(ruta, process.env.NEXT_PUBLIC_SUPABASE_URL) } }
}

/** "Quitar portada": clears it through the RPC, then deletes the file. */
export async function quitarPortadaDps(input: { readonly planId: string }): Promise<ResultadoDps<PortadaDps>> {
  if (!esUuid(input?.planId)) return fallo(DATOS_INVALIDOS)
  const s = await sesion()
  if (!s) return fallo(SIN_SESION)

  const leida = await serieEditable(s.rpc, input.planId)
  if ('error' in leida) return leida.error
  const { serie } = leida

  const { error } = await s.rpc('dps_serie_imagen', { p_serie_id: serie.id, p_path: null })
  if (error) return falloRpc(error, 'portada')
  if (anteriorBorrable(serie.imagenPath, serie.id, null)) await borrarArchivos([serie.imagenPath])
  return { ok: true, data: { imagenPath: null, url: null } }
}
