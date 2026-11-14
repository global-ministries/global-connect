/**
 * DPS — the e-mail side of the service notices (odd/tasks/dps-asistencia-pco.md,
 * T16b; S14.1, S14.2, S14.4, S14.5; artboards design/dps-avisos-correo 01-06).
 * The database writes each e-mail once, in the same transaction as the event,
 * into the outbox `dps_avisos_correos`
 * (supabase/migrations/20261114100000_dps_avisos_correo.sql):
 *   - «Enviar avisos» (dps_avisos_enviar): one row per person and send with
 *     every notice of it (people without an e-mail: a sin_correo row, the
 *     notice is only in the panel);
 *   - a «No puedo» (trigger on dps_avisos): one row to whoever sent it.
 * This module drains that outbox like lib/platform/talleres/avisos-envio.ts:
 * it leases due rows (dps_avisos_correos_reclamar), registers the hash of
 * each confirm link (dps_avisos_tokens_registrar) BEFORE sending, sends one
 * e-mail per row through Resend with the idempotency key
 * `dps-avisos/<row id>` (a retried row never reaches the person twice),
 * From = EMAIL_FROM, Reply-To = the planner (or the person who cannot), HTML
 * and plain text, and records each result (dps_avisos_correos_resultado).
 *
 * The confirm link (S14.2) is `/dps/confirmar/<token>`: the token is the
 * HMAC-SHA256 (base64url, 43 chars) of `dps-confirmar:<aviso>:<version>`
 * with DPS_AVISOS_SECRETO (or the service key), so a retry derives the same
 * link; the database keeps only its SHA-256 and confirms only that version,
 * until the plan's date. The public page reads and confirms it through
 * dps_aviso_token_leer / dps_aviso_token_confirmar with the service client.
 *
 * Callers: right after «Enviar avisos» and a «No puedo»
 * (despacharCorreosDps, never throws) and the daily route app/api/cron/dps
 * (ejecutarJobDps). Server-only. Logs carry row ids only, never an address.
 */
import { createHash, createHmac } from 'crypto'
import { createElement, type ReactElement } from 'react'

import { AvisoServicioEmail, contenidoAvisoServicio, textoAvisoServicio, type BloqueEmail, type TipoBloque } from '@/emails/dps/aviso-servicio'
import { NoPuedeEmail, asuntoNoPuede, textoNoPuede, type EstadoPersonaPuesto, type PuestoEmail } from '@/emails/dps/no-puede'
import { ETIQUETA_TIPO, type TipoPlan } from '@/lib/platform/dps/planilla'

import { leerServicioAviso } from './avisos'

interface RespuestaRpc {
  readonly data: unknown
  readonly error: { readonly message?: string | null } | null
}

/** The slice of the admin (service-role) client this module uses. */
export interface ClienteAdminDps {
  rpc(nombre: string, args?: Record<string, unknown>): PromiseLike<RespuestaRpc>
}

export interface CorreoDps {
  readonly to: string
  readonly subject: string
  readonly template: ReactElement
  readonly text: string
  readonly replyTo: string | null
  readonly idempotencyKey: string
}

export type EnviarCorreoDps = (correo: CorreoDps) => Promise<{ success: boolean; error?: string }>

export interface OpcionesCorreosDps {
  /** Rows per run (1–100). */
  readonly limite?: number
  /** Sent e-mails per UTC day for this outbox (Resend's quota day). */
  readonly topeDiario?: number
  readonly enviarCorreo?: EnviarCorreoDps
  readonly urlBase?: string
  readonly secreto?: string
  /** Wait between two sends (Resend allows a few requests per second). */
  readonly pausaMs?: number
}

export interface ResultadoCorreosDps {
  readonly reclamados: number
  readonly enviados: number
  readonly fallidos: number
}

export interface TokenRegistrado {
  readonly hash: string
  readonly aviso_id: string
  readonly version: number
}

/** A leased outbox row. */
export interface FilaCorreoDps {
  readonly id: string
  readonly tipo: 'avisos' | 'no_puede'
  readonly email: string
  readonly nombre: string
  readonly responderNombre: string | null
  readonly responderEmail: string | null
  readonly datos: Record<string, unknown>
}

/** A correo ready to send, with the hashes of its confirm links. */
export interface CorreoPreparado {
  readonly correo: CorreoDps
  readonly tokens: readonly TokenRegistrado[]
}

const LIMITE_POR_DEFECTO = 50
// Resend's free plan allows 100 e-mails per UTC day for the whole app (shared
// with the 1:1 reminders and the talleres notices). Override with
// DPS_AVISOS_TOPE_DIARIO.
const TOPE_DIARIO_POR_DEFECTO = 100
const PAUSA_POR_DEFECTO_MS = 500
const ERROR_DESCONOCIDO = 'Error desconocido'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
const TIPOS_BLOQUE: readonly TipoBloque[] = ['nueva', 'cambio', 'quitado']
const ESTADOS_PUESTO: readonly EstadoPersonaPuesto[] = ['confirmo', 'no_puede', 'pendiente', 'sin_avisar', 'sin_cuenta']

type Objeto = Record<string, unknown>
const objeto = (v: unknown): Objeto | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Objeto) : null)
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const entero = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) ? v : Number.parseInt(String(v ?? ''), 10) || 0)
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

// ── links ─────────────────────────────────────────────────────────────

/** The confirm token of one notice version (deterministic: a retry derives the same link). */
export function tokenConfirmar(avisoId: string, version: number, secreto: string): string {
  return createHmac('sha256', secreto).update(`dps-confirmar:${avisoId}:${version}`).digest('base64url')
}

/** What the database keeps of a token. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export const esTokenConFormato = (token: unknown): token is string => typeof token === 'string' && TOKEN_RE.test(token)

/** The Resend idempotency key of one outbox row. */
export const claveIdempotencia = (id: string): string => `dps-avisos/${id}`

const sinBarra = (base: string): string => base.replace(/\/+$/, '')
export const urlConfirmar = (base: string, token: string): string => `${sinBarra(base)}/dps/confirmar/${token}`
export const urlServicio = (base: string, planId: string): string => `${sinBarra(base)}/mis-servicios/${planId}`
/** «No puedo» opens the detail with its sheet open (the existing #no-puedo anchor). */
export const urlNoPuedo = (base: string, planId: string): string => `${urlServicio(base, planId)}#no-puedo`
export const urlMisServicios = (base: string): string => `${sinBarra(base)}/mis-servicios`
/** The plan of /dps/plan (`?plan=<id>`). */
export const urlPlan = (base: string, planId: string): string => `${sinBarra(base)}/dps/plan?plan=${planId}`

/** «Andrés Valero <andres@…>», with the name stripped of what would break the header. */
export function direccionResponder(nombre: string | null, email: string | null): string | null {
  if (!email) return null
  const limpio = (nombre ?? '').replace(/["<>\r\n,;]/g, ' ').replace(/\s+/g, ' ').trim()
  return limpio ? `${limpio} <${email}>` : email
}

// ── rows ──────────────────────────────────────────────────────────────

/** Parses the leased rows; a row without id, tipo or email is dropped. */
export function parseFilasCorreo(data: unknown): FilaCorreoDps[] {
  return lista(data).flatMap((bruto): FilaCorreoDps[] => {
    const f = objeto(bruto)
    const id = f && texto(f.id)
    const email = f && texto(f.email)
    if (!f || !id || !email || (f.tipo !== 'avisos' && f.tipo !== 'no_puede')) return []
    return [
      {
        id,
        tipo: f.tipo,
        email,
        nombre: texto(f.nombre) ?? '',
        responderNombre: texto(f.responder_nombre),
        responderEmail: texto(f.responder_email),
        datos: objeto(f.datos) ?? {},
      },
    ]
  })
}

interface BloqueLeido {
  readonly avisoId: string
  readonly version: number
  readonly planId: string
  readonly aviso: TipoBloque
  readonly confirmar: boolean
  readonly bloque: Omit<BloqueEmail, 'urlConfirmar' | 'urlNoPuedo' | 'urlVer'>
}

/** One notice of an 'avisos' row (dps_aviso_json + aviso_id, version, aviso, confirmar). */
export function leerBloque(v: unknown): BloqueLeido | null {
  const f = objeto(v)
  const servicio = leerServicioAviso(v)
  const aviso = f && (TIPOS_BLOQUE as readonly unknown[]).includes(f.aviso) ? (f.aviso as TipoBloque) : null
  if (!f || !servicio || !aviso || typeof f.aviso_id !== 'string' || !UUID_RE.test(f.aviso_id) || entero(f.version) < 1) return null
  const roles = (r: readonly { nombre: string; equipo: string }[]) => r.map(({ nombre, equipo }) => ({ nombre, equipo }))
  return {
    avisoId: f.aviso_id,
    version: entero(f.version),
    planId: servicio.planId,
    aviso,
    confirmar: f.confirmar === true,
    bloque: {
      aviso,
      fecha: servicio.fecha,
      tipo: servicio.tipo,
      titulo: servicio.titulo,
      serie: servicio.serie?.nombre ?? null,
      semana: servicio.semana,
      roles: roles(servicio.roles),
      horarios: servicio.horarios,
      llegada: servicio.llegada,
      estado: servicio.estado,
      antes: {
        roles: servicio.antes.roles ? roles(servicio.antes.roles) : null,
        fecha: servicio.antes.fecha,
        horarios: servicio.antes.horarios,
        llegada: servicio.antes.llegada,
      },
    },
  }
}

/** The 'avisos' e-mail of one person: one block per notice, a token per notice that asks for an answer. */
export function prepararCorreoAvisos(fila: FilaCorreoDps, base: string, secreto: string): CorreoPreparado | null {
  const leidos = lista(fila.datos.bloques).map(leerBloque).filter((b): b is BloqueLeido => b !== null)
  if (leidos.length === 0) return null
  const tokens: TokenRegistrado[] = []
  const bloques: BloqueEmail[] = leidos.map((b) => {
    let confirmar: string | null = null
    if (b.confirmar) {
      const token = tokenConfirmar(b.avisoId, b.version, secreto)
      tokens.push({ hash: hashToken(token), aviso_id: b.avisoId, version: b.version })
      confirmar = urlConfirmar(base, token)
    }
    return {
      ...b.bloque,
      urlConfirmar: confirmar,
      urlNoPuedo: confirmar ? urlNoPuedo(base, b.planId) : null,
      urlVer: b.aviso === 'quitado' ? urlMisServicios(base) : urlServicio(base, b.planId),
    }
  })
  const props = { nombre: fila.nombre, remitente: fila.responderNombre, respondeA: fila.responderEmail !== null, bloques }
  return {
    tokens,
    correo: {
      to: fila.email,
      subject: contenidoAvisoServicio(props).asunto,
      template: createElement(AvisoServicioEmail, props),
      text: textoAvisoServicio(props),
      replyTo: direccionResponder(fila.responderNombre, fila.responderEmail),
      idempotencyKey: claveIdempotencia(fila.id),
    },
  }
}

function contextoPlan(servicio: { titulo: string | null; serie: { nombre: string } | null; semana: number | null; tipo: string }): string {
  if (servicio.titulo) return servicio.titulo
  if (servicio.serie) return servicio.semana ? `${servicio.serie.nombre} · Parte ${servicio.semana}` : servicio.serie.nombre
  return servicio.tipo && servicio.tipo !== 'domingo' ? (ETIQUETA_TIPO[servicio.tipo as TipoPlan] ?? '') : ''
}

function leerPuesto(v: unknown): PuestoEmail | null {
  const f = objeto(v)
  if (!f) return null
  return {
    nombre: texto(f.nombre) ?? '',
    equipo: texto(f.equipo) ?? '',
    cantidad: entero(f.cantidad),
    cubiertos: entero(f.cubiertos),
    personas: lista(f.personas).flatMap((p) => {
      const g = objeto(p)
      const estado = g && (ESTADOS_PUESTO as readonly unknown[]).includes(g.estado) ? (g.estado as EstadoPersonaPuesto) : null
      return g && estado ? [{ nombre: texto(g.nombre) ?? '', estado }] : []
    }),
  }
}

/** The planner's «No puedo» e-mail (S14.4): Reply-To = the person who cannot. */
export function prepararCorreoNoPuede(fila: FilaCorreoDps, base: string): CorreoPreparado | null {
  const servicio = leerServicioAviso(fila.datos)
  if (!servicio) return null
  const persona = texto(fila.datos.persona) ?? fila.responderNombre ?? 'Alguien'
  const props = {
    nombre: fila.nombre,
    persona,
    fecha: servicio.fecha,
    contexto: contextoPlan(servicio),
    roles: servicio.roles.map(({ nombre, equipo }) => ({ nombre, equipo })),
    horarios: servicio.horarios,
    motivo: servicio.motivo,
    respondidoAt: servicio.respondidoAt,
    enviadoAt: servicio.enviadoAt,
    puestos: lista(fila.datos.puestos).map(leerPuesto).filter((p): p is PuestoEmail => p !== null),
    urlPlan: urlPlan(base, servicio.planId),
    respondeA: fila.responderEmail !== null,
  }
  return {
    tokens: [],
    correo: {
      to: fila.email,
      subject: asuntoNoPuede(props),
      template: createElement(NoPuedeEmail, props),
      text: textoNoPuede(props),
      replyTo: direccionResponder(fila.responderNombre, fila.responderEmail),
      idempotencyKey: claveIdempotencia(fila.id),
    },
  }
}

export function prepararCorreo(fila: FilaCorreoDps, base: string, secreto: string): CorreoPreparado | null {
  return fila.tipo === 'avisos' ? prepararCorreoAvisos(fila, base, secreto) : prepararCorreoNoPuede(fila, base)
}

// ── the drain ─────────────────────────────────────────────────────────

function urlBasePorDefecto(): string {
  return sinBarra(process.env.NEXT_PUBLIC_SITE_URL || 'https://connect.yosoyglobal.org')
}

function topeDiarioPorDefecto(): number {
  const valor = Number.parseInt(process.env.DPS_AVISOS_TOPE_DIARIO ?? '', 10)
  return Number.isInteger(valor) && valor >= 0 ? valor : TOPE_DIARIO_POR_DEFECTO
}

/** The key of the confirm links; null when neither is configured. */
export function secretoPorDefecto(): string | null {
  return process.env.DPS_AVISOS_SECRETO || process.env.SUPABASE_SERVICE_ROLE_KEY || null
}

/** Sends one e-mail with Resend: From = EMAIL_FROM, HTML + plain text, Reply-To, idempotency key. */
export async function enviarConResend(correo: CorreoDps): Promise<{ success: boolean; error?: string }> {
  const [{ getResendClient, EMAIL_FROM }, { render }] = await Promise.all([import('@/lib/email/resend'), import('@react-email/render')])
  const html = await render(correo.template)
  const { error } = await getResendClient().emails.send(
    {
      from: EMAIL_FROM,
      to: [correo.to],
      subject: correo.subject,
      html,
      text: correo.text,
      ...(correo.replyTo ? { replyTo: correo.replyTo } : {}),
    },
    { idempotencyKey: correo.idempotencyKey },
  )
  return error ? { success: false, error: error.message } : { success: true }
}

async function registrar(client: ClienteAdminDps, id: string, error: string | null): Promise<void> {
  const args = error === null ? { p_id: id, p_ok: true } : { p_id: id, p_ok: false, p_error: error.slice(0, 500) }
  try {
    const { error: fallo } = await client.rpc('dps_avisos_correos_resultado', args)
    if (fallo) console.error('[dps-avisos-correo] No se pudo registrar el envío', { id })
  } catch {
    // The lease expires and the row is retried; the idempotency key keeps
    // the person from getting it twice.
    console.error('[dps-avisos-correo] No se pudo registrar el envío', { id })
  }
}

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Leases due rows and sends them one by one; one failure never stops the
 * rest. Throws only when the lease itself fails (or no link key is set).
 */
export async function enviarCorreosDps(client: ClienteAdminDps, opciones: OpcionesCorreosDps = {}): Promise<ResultadoCorreosDps> {
  const enviar = opciones.enviarCorreo ?? enviarConResend
  const base = opciones.urlBase ?? urlBasePorDefecto()
  const secreto = opciones.secreto ?? secretoPorDefecto()
  const pausa = opciones.pausaMs ?? PAUSA_POR_DEFECTO_MS
  if (!secreto) throw new Error('Falta DPS_AVISOS_SECRETO para los enlaces de confirmar')

  const { data, error } = await client.rpc('dps_avisos_correos_reclamar', {
    p_limite: opciones.limite ?? LIMITE_POR_DEFECTO,
    p_tope_diario: opciones.topeDiario ?? topeDiarioPorDefecto(),
  })
  if (error) throw new Error(`No se pudieron tomar los correos: ${error.message ?? ERROR_DESCONOCIDO}`)

  const filas = parseFilasCorreo(data)
  let enviados = 0
  for (const [i, fila] of filas.entries()) {
    if (i > 0 && pausa > 0) await esperar(pausa)
    let fallo: string | null = null
    try {
      const preparado = prepararCorreo(fila, base, secreto)
      if (!preparado) {
        fallo = 'datos_invalidos'
      } else {
        // The links must work before the e-mail leaves.
        if (preparado.tokens.length > 0) {
          const r = await client.rpc('dps_avisos_tokens_registrar', { p_tokens: preparado.tokens })
          if (r.error) fallo = `tokens: ${r.error.message ?? ERROR_DESCONOCIDO}`
        }
        if (fallo === null) {
          const resultado = await enviar(preparado.correo)
          fallo = resultado.success ? null : resultado.error || ERROR_DESCONOCIDO
        }
      }
    } catch (causa) {
      fallo = causa instanceof Error ? causa.message : ERROR_DESCONOCIDO
    }
    if (fallo === null) enviados += 1
    else console.error('[dps-avisos-correo] Falló un correo', { id: fila.id })
    await registrar(client, fila.id, fallo)
  }
  return { reclamados: filas.length, enviados, fallidos: filas.length - enviados }
}

/**
 * Best effort, right after «Enviar avisos» or a «No puedo»: sends what is
 * due now. Never throws; whatever is left goes with the daily run.
 */
export async function despacharCorreosDps(opciones: OpcionesCorreosDps = {}): Promise<void> {
  try {
    const { createSupabaseAdminClient } = await import('@/lib/supabase/admin')
    await enviarCorreosDps(createSupabaseAdminClient() as unknown as ClienteAdminDps, opciones)
  } catch (causa) {
    console.error('[dps-avisos-correo] Despacho inmediato falló', { error: causa instanceof Error ? causa.message : String(causa) })
  }
}

export interface ResultadoJobDps {
  readonly correos: ResultadoCorreosDps | null
  readonly fallos: readonly string[]
}

/**
 * The daily DPS job (app/api/cron/dps): a list of steps, each one isolated.
 * Today only the outbox (retries what an immediate dispatch left);
 * T16c adds the reminder here.
 */
export async function ejecutarJobDps(client: ClienteAdminDps, opciones: OpcionesCorreosDps = {}): Promise<ResultadoJobDps> {
  const fallos: string[] = []
  let correos: ResultadoCorreosDps | null = null
  const pasos: readonly { readonly nombre: string; readonly ejecutar: () => Promise<void> }[] = [
    {
      nombre: 'correos',
      ejecutar: async () => {
        correos = await enviarCorreosDps(client, opciones)
      },
    },
  ]
  for (const paso of pasos) {
    try {
      await paso.ejecutar()
    } catch (causa) {
      fallos.push(paso.nombre)
      console.error('[dps-cron] Falló un paso', { paso: paso.nombre, error: causa instanceof Error ? causa.message : String(causa) })
    }
  }
  return { correos, fallos }
}

// ── the public confirm page (S14.2, S14.5) ────────────────────────────

export type EstadoEnlace = 'por_confirmar' | 'confirmado' | 'ya_confirmado' | 'no_puede' | 'cambio' | 'quitado' | 'vencido' | 'invalido' | 'error'

const ESTADOS_ENLACE: readonly EstadoEnlace[] = ['por_confirmar', 'confirmado', 'ya_confirmado', 'no_puede', 'cambio', 'quitado', 'vencido', 'invalido']

export interface RolEnlace {
  readonly nombre: string
  readonly equipo: string
}

/** What the page may show: puesto, fecha and hours, never a name. */
export interface ServicioEnlace {
  readonly estado: EstadoEnlace
  readonly planId: string | null
  readonly fecha: string | null
  readonly tipo: string | null
  readonly titulo: string | null
  readonly serie: string | null
  readonly roles: readonly RolEnlace[]
  readonly horarios: readonly string[]
  readonly llegada: string | null
  readonly respondidoAt: string | null
  readonly antes: {
    readonly roles: readonly RolEnlace[] | null
    readonly fecha: string | null
    readonly horarios: readonly string[] | null
    readonly llegada: string | null
  } | null
}

/** A state without a service (invalido, error). */
export const enlaceVacio = (estado: EstadoEnlace): ServicioEnlace => ({
  estado,
  planId: null,
  fecha: null,
  tipo: null,
  titulo: null,
  serie: null,
  roles: [],
  horarios: [],
  llegada: null,
  respondidoAt: null,
  antes: null,
})

const textos = (v: unknown): string[] => lista(v).filter((x): x is string => typeof x === 'string')
const rolesEnlace = (v: unknown): RolEnlace[] =>
  lista(v).flatMap((r) => {
    const o = objeto(r)
    return o ? [{ nombre: texto(o.nombre) ?? '', equipo: texto(o.equipo) ?? '' }] : []
  })

/** Reads dps_aviso_token_leer / dps_aviso_token_confirmar; anything odd reads as invalido. */
export function leerServicioEnlace(data: unknown): ServicioEnlace {
  const f = objeto(data)
  const estado = f && (ESTADOS_ENLACE as readonly unknown[]).includes(f.estado) ? (f.estado as EstadoEnlace) : null
  if (!f || !estado || estado === 'invalido') return enlaceVacio('invalido')
  const antes = objeto(f.antes)
  const planId = texto(f.plan_id)
  return {
    estado,
    planId: planId && UUID_RE.test(planId) ? planId : null,
    fecha: texto(f.fecha),
    tipo: texto(f.tipo),
    titulo: texto(f.titulo),
    serie: texto(f.serie),
    roles: rolesEnlace(f.roles),
    horarios: textos(f.horarios),
    llegada: texto(f.llegada),
    respondidoAt: texto(f.respondido_at),
    antes: antes
      ? {
          roles: Array.isArray(antes.roles) ? rolesEnlace(antes.roles) : null,
          fecha: texto(antes.fecha),
          horarios: Array.isArray(antes.horarios) ? textos(antes.horarios) : null,
          llegada: texto(antes.llegada),
        }
      : null,
  }
}

async function llamarEnlace(client: ClienteAdminDps, nombre: 'dps_aviso_token_leer' | 'dps_aviso_token_confirmar', token: unknown): Promise<ServicioEnlace> {
  if (!esTokenConFormato(token)) return enlaceVacio('invalido')
  try {
    const { data, error } = await client.rpc(nombre, { p_token: token })
    if (error) {
      console.error('[dps-confirmar] Falló', { rpc: nombre })
      return enlaceVacio('error')
    }
    return leerServicioEnlace(data)
  } catch {
    console.error('[dps-confirmar] Falló', { rpc: nombre })
    return enlaceVacio('error')
  }
}

/** The page on load: reads, never confirms (link scanners open it too). */
export const consultarEnlace = (client: ClienteAdminDps, token: unknown): Promise<ServicioEnlace> => llamarEnlace(client, 'dps_aviso_token_leer', token)

/** The big «Confirmar» button. */
export const confirmarEnlace = (client: ClienteAdminDps, token: unknown): Promise<ServicioEnlace> => llamarEnlace(client, 'dps_aviso_token_confirmar', token)

