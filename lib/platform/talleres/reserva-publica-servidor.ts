/**
 * Server half of the public reservation (T5b of
 * odd/tasks/talleres-reserva-publica.md): the handlers behind POST
 * /api/talleres/reserva/*, with their dependencies injected like the Niños
 * pre-registration (lib/platform/ninos/preregistro-servidor.ts).
 *
 * The one-time code is generated here, stored only as a salted hash, emailed
 * to the address on file and put in the person's in-app notice (S11). The
 * browser gets a masked email at most: `envio` (the real address) never
 * leaves this module. After a correct code the browser keeps a random token
 * whose sha256 the database stores; talleres_reserva_crear receives only that
 * hash. Every RPC here is service_role only and applies its own rate limits
 * by the salted IP hash.
 */
import { createHash, randomBytes, randomInt } from 'node:crypto'
import { createElement, type ReactElement } from 'react'

import { CodigoReservaTallerEmail } from '@/emails/codigo-reserva-taller'
import { hashIp } from '@/lib/platform/ninos/preregistro-servidor'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

import {
  MENSAJES,
  mensajeCampo,
  mensajeEspera,
  mensajeIntentos,
  parseAvisame,
  parseCatalogo,
  parseCrear,
  parseIdentificar,
  parseReenviar,
  parseTallerPublico,
  parseVerificar,
  statusDe,
  type EstadoReserva,
  type ParejaCrear,
  type PrincipalCrear,
  type TallerPublico,
} from './reserva-publica'

/** Six digits, zero-padded, from the CSPRNG. */
export function generarCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/** Salted SHA-256 of the code: the database only ever sees this. */
export function hashCodigo(codigo: string, sal: string): string {
  return createHash('sha256').update(`${sal}:${codigo}`).digest('hex')
}

/** 32 random bytes in base64url (43 characters). */
export function generarTokenReserva(): string {
  return randomBytes(32).toString('base64url')
}

/** SHA-256 of the reservation token (high entropy: no salt needed). */
export function hashTokenReserva(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

type RespuestaRpc = { data: unknown; error: { code?: string; message?: string } | null }

export interface CorreoReserva {
  readonly to: string
  readonly subject: string
  readonly template: ReactElement
  readonly idempotencyKey?: string
}

export interface DependenciasReserva {
  /** Service-role RPC (every reservation function is service_role only). */
  readonly rpc: (nombre: string, args: Record<string, unknown>) => PromiseLike<RespuestaRpc>
  readonly sal: string
  readonly enviarCorreo: (correo: CorreoReserva) => Promise<{ success: boolean }>
  /** Sends the /activar email of one invitation; never throws. */
  readonly enviarInvitacion: (invitacionId: string) => Promise<unknown>
  /** Sends the due notice emails (the «Inscripción recibida» just written); never throws. */
  readonly despacharAvisos: () => Promise<unknown>
  /** Random by default; tests pin them. */
  readonly codigo?: () => string
  readonly token?: () => string
}

export type RespuestaRuta = { status: number; body: Record<string, unknown> }

/** The service-role client's rpc; the generated types do not list these functions yet. */
export function rpcServicio(): DependenciasReserva['rpc'] {
  const admin = createSupabaseAdminClient()
  return (admin.rpc as unknown as DependenciasReserva['rpc']).bind(admin) as DependenciasReserva['rpc']
}

/** The public catalog for /talleres/reservar; empty on a failed read (logged by code). */
export async function leerCatalogoPublico(rpc: DependenciasReserva['rpc']): Promise<TallerPublico[]> {
  const { data, error } = await rpc('talleres_publico_catalogo', {})
  if (error) {
    console.error('[talleres/reservar] catalogo falló:', error.code ?? 'sin código')
    return []
  }
  return parseCatalogo(data)
}

/** One public taller by slug; null when it is not public (or the read failed). */
export async function leerTallerPublico(rpc: DependenciasReserva['rpc'], slug: string): Promise<TallerPublico | null> {
  const { data, error } = await rpc('talleres_publico_taller', { p_slug: slug })
  if (error) {
    console.error('[talleres/reservar] taller falló:', error.code ?? 'sin código')
    return null
  }
  return parseTallerPublico(data)
}

type Objeto = Record<string, unknown>
const esObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v)

const responder = (estado: EstadoReserva, extra: Objeto = {}): RespuestaRuta => ({ status: statusDe(estado), body: { estado, ...extra } })

const solicitudInvalida = (): RespuestaRuta => responder('invalido', { mensaje: MENSAJES.solicitudInvalida })

/** Code only: the message may carry what the visitor typed. */
function fallo(accion: string, error: { code?: string }): RespuestaRuta {
  console.error(`[talleres/reserva/${accion}] rpc falló:`, error.code ?? 'sin código')
  return responder('error', { mensaje: MENSAJES.error })
}

const estadoDe = (data: unknown) => (esObjeto(data) && typeof data.estado === 'string' ? data.estado : null)

/** The taller's name, and whether the edición is one of its open ones. */
async function tallerDe(deps: DependenciasReserva, slug: string, edicionId?: string) {
  const { data, error } = await deps.rpc('talleres_publico_taller', { p_slug: slug })
  if (error) return { error }
  const taller = parseTallerPublico(data)
  return {
    nombre: taller?.nombre ?? null,
    edicionAbierta: edicionId ? !!taller?.ediciones.some((e) => e.id === edicionId) : false,
  }
}

const textoAviso = (taller: string, codigo: string) => `Tu código para reservar en ${taller}: ${codigo}. Vence en 10 minutos.`

/**
 * Emails a code to `envio` of a codigo answer and returns what the browser
 * may see: the code row id and the masked email. A failed email is logged
 * (id only) and the flow goes on: the code is also in the app notice, and the
 * visitor can resend it or continue without it.
 */
async function enviarCodigo(deps: DependenciasReserva, data: Objeto, taller: string, codigo: string, hash: string): Promise<RespuestaRuta> {
  const codigoId = typeof data.codigo_id === 'string' ? data.codigo_id : null
  const envio = esObjeto(data.envio) ? data.envio : null
  const email = typeof envio?.email === 'string' ? envio.email : null
  if (!codigoId || !email) {
    console.error('[talleres/reserva/codigo] respuesta sin código o sin envío')
    return responder('error', { mensaje: MENSAJES.error })
  }
  try {
    const r = await deps.enviarCorreo({
      to: email,
      // Never the code: send.ts logs the subject of a failed email.
      subject: `Tu código para reservar en ${taller}`,
      template: createElement(CodigoReservaTallerEmail, {
        nombre: typeof envio?.nombre === 'string' ? envio.nombre : '',
        tallerNombre: taller,
        codigo,
      }),
      idempotencyKey: `reserva-codigo/${codigoId}/${hash.slice(0, 16)}`,
    })
    if (!r.success) console.error('[talleres/reserva/codigo] envío falló:', codigoId)
  } catch {
    console.error('[talleres/reserva/codigo] envío falló:', codigoId)
  }
  return responder('codigo', { codigoId, emailMascara: typeof data.email_mascara === 'string' ? data.email_mascara : null })
}

/** Cédula → codigo (sent) | nuevo | sin_correo (S3, S4). */
export async function identificarReserva(deps: DependenciasReserva, body: unknown, ip: string): Promise<RespuestaRuta> {
  const s = parseIdentificar(body)
  if (!s) return solicitudInvalida()
  // A bot filled the hidden field: the neutral answer, nothing read or written.
  if (s.honeypot) return responder('nuevo')

  const taller = await tallerDe(deps, s.slug, s.edicionId)
  if ('error' in taller) return fallo('identificar', taller.error ?? {})
  if (!taller.edicionAbierta || !taller.nombre) return responder('cerrada', { mensaje: MENSAJES.cerrada })

  const codigo = (deps.codigo ?? generarCodigo)()
  const hash = hashCodigo(codigo, deps.sal)
  const { data, error } = await deps.rpc('talleres_reserva_identificar', {
    p_edicion_id: s.edicionId,
    p_cedula: s.cedula,
    p_ip_hash: hashIp(ip, deps.sal),
    p_codigo_hash: hash,
    p_aviso_texto: textoAviso(taller.nombre, codigo),
  })
  if (error) return fallo('identificar', error)
  switch (estadoDe(data)) {
    case 'codigo':
      return enviarCodigo(deps, data as Objeto, taller.nombre, codigo, hash)
    case 'nuevo':
      return responder('nuevo')
    case 'sin_correo':
      return responder('sin_correo')
    case 'cerrada':
      return responder('cerrada', { mensaje: MENSAJES.cerrada })
    case 'limite':
      return responder('limite', { mensaje: MENSAJES.limite })
    case 'invalido':
      return responder('invalido', { campo: 'cedula', mensaje: MENSAJES.cedula })
    default:
      return fallo('identificar', { code: 'estado_desconocido' })
  }
}

/** The code → ok with a fresh token (only its hash is stored). */
export async function verificarCodigoReserva(deps: DependenciasReserva, body: unknown, ip: string): Promise<RespuestaRuta> {
  const s = parseVerificar(body)
  if (!s) return responder('invalido', { mensaje: 'Escribe los 6 dígitos del código.' })

  const token = (deps.token ?? generarTokenReserva)()
  const { data, error } = await deps.rpc('talleres_reserva_codigo_verificar', {
    p_codigo_id: s.codigoId,
    p_codigo_hash: hashCodigo(s.codigo, deps.sal),
    p_token_hash: hashTokenReserva(token),
    p_ip_hash: hashIp(ip, deps.sal),
  })
  if (error) return fallo('verificar', error)
  const d = data as Objeto
  switch (estadoDe(data)) {
    case 'ok':
      return responder('ok', { nombre: typeof d.nombre === 'string' ? d.nombre : '', token })
    case 'invalido': {
      const restantes = typeof d.intentos_restantes === 'number' ? d.intentos_restantes : null
      return restantes === null
        ? responder('invalido', { mensaje: MENSAJES.codigoInvalido })
        : responder('invalido', { intentosRestantes: restantes, mensaje: mensajeIntentos(restantes) })
    }
    case 'vencido':
      return responder('vencido', { mensaje: MENSAJES.vencido })
    case 'bloqueado':
      return responder('bloqueado', { mensaje: MENSAJES.bloqueado })
    case 'limite':
      return responder('limite', { mensaje: MENSAJES.limite })
    default:
      return fallo('verificar', { code: 'estado_desconocido' })
  }
}

/** A new code for the same row (60 s apart, at most 3). */
export async function reenviarCodigoReserva(deps: DependenciasReserva, body: unknown, ip: string): Promise<RespuestaRuta> {
  const s = parseReenviar(body)
  if (!s) return solicitudInvalida()

  const taller = await tallerDe(deps, s.slug)
  if ('error' in taller) return fallo('reenviar', taller.error ?? {})
  const nombre = taller.nombre ?? 'el taller'

  const codigo = (deps.codigo ?? generarCodigo)()
  const hash = hashCodigo(codigo, deps.sal)
  const { data, error } = await deps.rpc('talleres_reserva_codigo_reenviar', {
    p_codigo_id: s.codigoId,
    p_codigo_hash_nuevo: hash,
    p_ip_hash: hashIp(ip, deps.sal),
    p_aviso_texto: textoAviso(nombre, codigo),
  })
  if (error) return fallo('reenviar', error)
  const d = data as Objeto
  switch (estadoDe(data)) {
    case 'codigo':
      return enviarCodigo(deps, d, nombre, codigo, hash)
    case 'espera': {
      const segundos = typeof d.segundos === 'number' ? d.segundos : 60
      return responder('espera', { segundos, mensaje: mensajeEspera(segundos) })
    }
    case 'bloqueado':
      return responder('bloqueado', { mensaje: MENSAJES.bloqueado })
    case 'limite':
      return responder('limite', { mensaje: 'Ya pediste varios códigos. Vuelve a escribir tu cédula o sigue sin código.' })
    case 'invalido':
      return responder('invalido', { mensaje: MENSAJES.codigoInvalido })
    default:
      return fallo('reenviar', { code: 'estado_desconocido' })
  }
}

function datosPrincipal(p: PrincipalCrear): Objeto {
  if ('token' in p) return { token: hashTokenReserva(p.token) }
  return p
}

function datosPareja(p: ParejaCrear): Objeto {
  if ('token' in p) return { token: hashTokenReserva(p.token) }
  return p
}

const MENSAJE_CREAR: Partial<Record<EstadoReserva, string>> = {
  cupo_lleno: MENSAJES.cupoLleno,
  ya_inscrito: MENSAJES.yaInscrito,
  cerrada: MENSAJES.cerrada,
  genero_no_aplica: MENSAJES.generoNoAplica,
  pareja_no_disponible: MENSAJES.parejaNoDisponible,
  limite: MENSAJES.limite,
}

/**
 * The inscription (always pendiente, S5). A new person gets the /activar
 * email right away (S4); the answer says only what the confirmation shows.
 */
export async function crearReserva(deps: DependenciasReserva, body: unknown, ip: string): Promise<RespuestaRuta> {
  const s = parseCrear(body)
  if (!s) return solicitudInvalida()
  if (s.honeypot) return responder('ok', { porVerificar: false, cuentaNueva: 'ficha_nueva' in s.principal })

  const datos: Objeto = datosPrincipal(s.principal)
  if (s.pareja) datos.pareja = datosPareja(s.pareja)
  if (s.vinculo) datos.vinculo = s.vinculo

  const { data, error } = await deps.rpc('talleres_reserva_crear', {
    p_edicion_id: s.edicionId,
    p_datos: datos,
    p_ip_hash: hashIp(ip, deps.sal),
  })
  if (error) return fallo('crear', error)
  const d = data as Objeto
  const estado = estadoDe(data) as EstadoReserva | null
  if (estado === 'ok') {
    const invitacionId = typeof d.invitacion_id === 'string' ? d.invitacion_id : null
    if (invitacionId) await deps.enviarInvitacion(invitacionId)
    await deps.despacharAvisos()
    return responder('ok', { porVerificar: d.por_verificar === true, cuentaNueva: invitacionId !== null })
  }
  if (estado === 'invalido') {
    return typeof d.campo === 'string'
      ? responder('invalido', { campo: d.campo, mensaje: mensajeCampo(d.campo) })
      : responder('invalido', { mensaje: MENSAJES.datosRechazados })
  }
  const mensaje = estado ? MENSAJE_CREAR[estado] : undefined
  if (estado && mensaje) return responder(estado, { mensaje })
  return fallo('crear', { code: 'estado_desconocido' })
}

/** "Avísame si se libera un lugar" (S13: everyone is told at once). */
export async function avisameLugar(deps: DependenciasReserva, body: unknown, ip: string): Promise<RespuestaRuta> {
  const s = parseAvisame(body)
  if (!s) return solicitudInvalida()
  if (s.honeypot) return responder('ok')

  const { data, error } = await deps.rpc('talleres_avisame_lugar_agregar', {
    p_edicion_id: s.edicionId,
    p_nombre: s.nombre,
    p_email: s.email,
    p_ip_hash: hashIp(ip, deps.sal),
  })
  if (error) return fallo('avisame', error)
  const d = data as Objeto
  switch (estadoDe(data)) {
    case 'ok':
      return responder('ok')
    case 'invalido': {
      const campo = typeof d.campo === 'string' ? d.campo : 'email'
      return responder('invalido', { campo, mensaje: mensajeCampo(campo) })
    }
    case 'cerrada':
      return responder('cerrada', { mensaje: MENSAJES.cerrada })
    case 'limite':
      return responder('limite', { mensaje: MENSAJES.limite })
    default:
      return fallo('avisame', { code: 'estado_desconocido' })
  }
}
