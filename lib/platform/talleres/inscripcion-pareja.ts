/**
 * Inscripción en pareja (odd/tasks/talleres-inscripcion-en-pareja.md P2) —
 * the client-safe contract of the three member RPCs behind Explorar:
 *
 *   - `talleres_mi_conyuge_registrado()` → 0 or 1 row
 *     `{nombre, apellido, foto_perfil_url}` (exactly 1 only when the caller
 *     has exactly one registered spouse);
 *   - `talleres_buscar_pareja_por_cedula(p_edicion_id, p_cedula)` → jsonb
 *     `{ok:true, encontrada:true, nombre_mostrado}` | `{ok:true,
 *     encontrada:false}` | `{ok:false, codigo}`;
 *   - `talleres_inscribirme(p_edicion_id, p_pareja)` → jsonb `{ok:true,
 *     inscripcion_id, estado, pareja_origen}` | `{ok:false, codigo}`.
 *     Mode `ficha_nueva` (odd/tasks/talleres-conyuge-invitacion.md C2)
 *     creates the partner's ficha from `{cedula, nombre, apellido, email,
 *     fecha_nacimiento, genero}` and queues an access invitation; it
 *     answers LIMITE_ALCANZADO when the mode is not available to the caller.
 *
 * Plain module (no 'use server', no Supabase import) so the Explorar server
 * actions and the partner picker share one set of parsers and one Spanish
 * message per code. Every jsonb answer goes through a small typed parser:
 * anything off-contract parses to null and the caller degrades to a generic
 * error instead of trusting a blind cast.
 */

import { esCedulaReconocible, prepararCedula } from '@/lib/utils/cedula'

export type VinculoPareja = 'matrimonio' | 'novios'

const VINCULOS: readonly VinculoPareja[] = ['matrimonio', 'novios']

/**
 * How the member identifies their partner. `vinculo` is only sent when the
 * edición leaves it open (its `link_type` is null) and the member chose it.
 * `conyugeDescartado` marks a cédula search that follows "No es mi cónyuge
 * actual" on the registered-spouse card.
 */
export type GeneroPareja = 'Masculino' | 'Femenino'

const GENEROS: readonly GeneroPareja[] = ['Masculino', 'Femenino']

/** A partner who is not in the system yet: the RPC creates the ficha. */
export interface FichaNuevaPareja {
  readonly cedula: string
  readonly nombre: string
  readonly apellido: string
  readonly email: string
  /** YYYY-MM-DD */
  readonly fechaNacimiento: string
  readonly genero: GeneroPareja
}

export type ParejaInscripcion =
  | { readonly modo: 'conyuge_registrado'; readonly vinculo?: VinculoPareja }
  | {
      readonly modo: 'cedula'
      readonly cedula: string
      readonly vinculo?: VinculoPareja
      readonly conyugeDescartado?: boolean
    }
  | ({ readonly modo: 'ficha_nueva'; readonly vinculo?: VinculoPareja } & FichaNuevaPareja)

/** Codes `talleres_inscribirme` RETURNS as `{ok:false, codigo}`. */
export const CODIGOS_INSCRIBIRME = [
  'EDICION_NOT_FOUND',
  'EDICION_NO_ABIERTA',
  'YA_INSCRITO',
  'CUPO_LLENO',
  'PAREJA_NO_CONFIRMADA',
  'PAREJA_NO_DISPONIBLE',
  'LIMITE_ALCANZADO',
] as const
export type CodigoInscribirme = (typeof CODIGOS_INSCRIBIRME)[number]

/** Codes `talleres_buscar_pareja_por_cedula` RETURNS as `{ok:false, codigo}`. */
export const CODIGOS_BUSQUEDA = ['LIMITE_ALCANZADO', 'EDICION_NOT_FOUND'] as const
export type CodigoBusqueda = (typeof CODIGOS_BUSQUEDA)[number]

/**
 * Codes the RPCs RAISE: 42501 SIN_FICHA, 22023 input errors, and the
 * one-appearance trigger's P0001 PERSONA_YA_EN_EDICION (normally mapped to a
 * returned code by the RPC itself; kept here so a race never shows raw text).
 */
export const CODIGOS_ELEVADOS = [
  'SIN_FICHA',
  'VINCULO_REQUERIDO',
  'MODO_NO_APLICA',
  'COMPANERO_REQUERIDO',
  'COMPANERO_NO_APLICA',
  'MODO_INVALIDO',
  'CEDULA_INVALIDA',
  'NOMBRE_INVALIDO',
  'EMAIL_INVALIDO',
  'FECHA_NACIMIENTO_INVALIDA',
  'GENERO_INVALIDO',
  'PERSONA_YA_EN_EDICION',
] as const
export type CodigoElevado = (typeof CODIGOS_ELEVADOS)[number]

export type CodigoPareja = CodigoInscribirme | CodigoElevado

/**
 * One neutral Spanish message per code. The partner replies never say which
 * part failed or whether the person exists: a not-found cédula, a mismatch
 * and the caller's own cédula all read the same.
 */
export const MENSAJES_PAREJA: Readonly<Record<CodigoPareja, string>> = {
  EDICION_NOT_FOUND: 'Esta edición ya no está disponible para inscripciones.',
  EDICION_NO_ABIERTA: 'Las inscripciones de esta edición están cerradas.',
  YA_INSCRITO: 'Ya tienes una inscripción en esta edición.',
  CUPO_LLENO: 'Esta edición ya no tiene cupos disponibles.',
  PAREJA_NO_CONFIRMADA:
    'No pudimos confirmar a tu pareja con esos datos. Revisa la cédula o pide ayuda a la coordinación del taller.',
  PAREJA_NO_DISPONIBLE:
    'No es posible inscribir a esa pareja en esta edición. Pide ayuda a la coordinación del taller.',
  LIMITE_ALCANZADO: 'Hiciste demasiadas búsquedas hoy. Prueba mañana o pide ayuda a la coordinación.',
  SIN_FICHA: 'Tu cuenta todavía no tiene una ficha de miembro. Pide ayuda a la coordinación del taller.',
  VINCULO_REQUERIDO: 'Indica si se inscriben como matrimonio o como novios.',
  MODO_NO_APLICA: 'Este taller es para novios: busca a tu pareja por su cédula.',
  COMPANERO_REQUERIDO: 'Este taller es para parejas: indica quién es tu pareja para inscribirse.',
  COMPANERO_NO_APLICA: 'Este taller es individual: la inscripción no lleva pareja.',
  MODO_INVALIDO: 'No se pudo identificar a tu pareja. Vuelve a intentarlo.',
  CEDULA_INVALIDA:
    'Revisa la cédula: debe tener de 6 a 8 números, o una E y de 6 a 9 números si es extranjera.',
  NOMBRE_INVALIDO: 'Escribe el nombre y el apellido de tu pareja.',
  EMAIL_INVALIDO: 'Revisa el correo de tu pareja: no parece una dirección válida.',
  FECHA_NACIMIENTO_INVALIDA: 'Revisa la fecha de nacimiento de tu pareja.',
  GENERO_INVALIDO: 'Indica el género de tu pareja.',
  PERSONA_YA_EN_EDICION:
    'Uno de los dos ya figura en una inscripción de esta edición. Pide ayuda a la coordinación del taller.',
}

export type OrigenPareja = 'conyuge_registrado' | 'cedula' | 'ficha_nueva'

const ORIGENES: readonly OrigenPareja[] = ['conyuge_registrado', 'cedula', 'ficha_nueva']

/**
 * LIMITE_ALCANZADO on a `ficha_nueva` enrollment means the mode is not
 * available to the caller right now, not that they searched too much.
 */
export const MENSAJE_FICHA_NUEVA_NO_DISPONIBLE =
  'No es posible registrar a tu pareja desde aquí en este momento. Pide ayuda a la coordinación del taller.'

export type ResultadoInscribirme =
  | { readonly ok: true; readonly inscripcionId: string; readonly parejaOrigen: OrigenPareja | null }
  | { readonly ok: false; readonly codigo: CodigoInscribirme }

export type ResultadoBusquedaPareja =
  | { readonly ok: true; readonly encontrada: true; readonly nombreMostrado: string }
  | { readonly ok: true; readonly encontrada: false }
  | { readonly ok: false; readonly codigo: CodigoBusqueda }

export interface ConyugeRegistrado {
  readonly nombre: string
  readonly apellido: string
  readonly fotoUrl: string | null
}

function esObjeto(valor: unknown): valor is Readonly<Record<string, unknown>> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function textoNoVacio(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim().length > 0 ? valor : null
}

function esUnoDe<T extends string>(lista: readonly T[], valor: unknown): valor is T {
  return typeof valor === 'string' && (lista as readonly string[]).includes(valor)
}

export function parseResultadoInscribirme(raw: unknown): ResultadoInscribirme | null {
  if (!esObjeto(raw)) return null
  if (raw.ok === false) {
    return esUnoDe(CODIGOS_INSCRIBIRME, raw.codigo) ? { ok: false, codigo: raw.codigo } : null
  }
  if (raw.ok !== true) return null
  const inscripcionId = textoNoVacio(raw.inscripcion_id)
  if (inscripcionId === null) return null
  // The enrollment committed: an origen this client does not know yet only
  // loses the label, never the success.
  const parejaOrigen = esUnoDe(ORIGENES, raw.pareja_origen) ? raw.pareja_origen : null
  return { ok: true, inscripcionId, parejaOrigen }
}

export function parseBusquedaPareja(raw: unknown): ResultadoBusquedaPareja | null {
  if (!esObjeto(raw)) return null
  if (raw.ok === false) {
    return esUnoDe(CODIGOS_BUSQUEDA, raw.codigo) ? { ok: false, codigo: raw.codigo } : null
  }
  if (raw.ok !== true) return null
  if (raw.encontrada === false) return { ok: true, encontrada: false }
  if (raw.encontrada !== true) return null
  const nombreMostrado = textoNoVacio(raw.nombre_mostrado)
  return nombreMostrado === null ? null : { ok: true, encontrada: true, nombreMostrado }
}

/** Exactly one well-formed row, or null (no spouse, several, or drift: fail closed). */
export function parseConyugeRegistrado(raw: unknown): ConyugeRegistrado | null {
  if (!Array.isArray(raw) || raw.length !== 1) return null
  const fila: unknown = raw[0]
  if (!esObjeto(fila)) return null
  const nombre = textoNoVacio(fila.nombre)
  if (nombre === null || typeof fila.apellido !== 'string') return null
  return { nombre, apellido: fila.apellido, fotoUrl: textoNoVacio(fila.foto_perfil_url) }
}

/** The `p_pareja` jsonb for `talleres_inscribirme` (null for an individual edición). */
export function parejaParaRpc(pareja: ParejaInscripcion | null): Record<string, string | boolean> | null {
  if (pareja === null) return null
  let base: Record<string, string | boolean>
  if (pareja.modo === 'ficha_nueva') {
    base = {
      modo: 'ficha_nueva',
      cedula: pareja.cedula,
      nombre: pareja.nombre,
      apellido: pareja.apellido,
      email: pareja.email,
      fecha_nacimiento: pareja.fechaNacimiento,
      genero: pareja.genero,
    }
  } else {
    base = pareja.modo === 'cedula' ? { modo: 'cedula', cedula: pareja.cedula } : { modo: 'conyuge_registrado' }
  }
  if (pareja.vinculo) base.vinculo = pareja.vinculo
  if (pareja.modo === 'cedula' && pareja.conyugeDescartado === true) base.conyuge_descartado = true
  return base
}

/** A typed cédula as the RPC expects it, or null when it can never match. */
export function cedulaParaRpc(valor: unknown): string | null {
  const cedula = prepararCedula(valor)
  return cedula !== null && esCedulaReconocible(cedula) ? cedula : null
}

export type ValidacionPareja =
  | { readonly ok: true; readonly pareja: ParejaInscripcion | null }
  | { readonly ok: false; readonly error: 'invalid-input' | ErrorFichaNueva }

/** Input errors the server catches before spending an RPC call. */
export type ErrorFichaNueva =
  | 'CEDULA_INVALIDA'
  | 'NOMBRE_INVALIDO'
  | 'EMAIL_INVALIDO'
  | 'FECHA_NACIMIENTO_INVALIDA'
  | 'GENERO_INVALIDO'

const LARGO_MAXIMO_NOMBRE = 100
const LARGO_MAXIMO_EMAIL = 254
const PATRON_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PATRON_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

function nombreValido(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpio = valor.trim().replace(/\s+/g, ' ')
  return limpio.length > 0 && limpio.length <= LARGO_MAXIMO_NOMBRE ? limpio : null
}

function emailValido(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpio = valor.trim().toLowerCase()
  return limpio.length <= LARGO_MAXIMO_EMAIL && PATRON_EMAIL.test(limpio) ? limpio : null
}

/** A real calendar date between 1900-01-01 and today (UTC). */
function fechaNacimientoValida(valor: unknown, hoy: Date = new Date()): string | null {
  if (typeof valor !== 'string') return null
  const partes = PATRON_FECHA.exec(valor.trim())
  if (!partes) return null
  const [, anio, mes, dia] = partes
  const fecha = new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia)))
  if (fecha.getUTCFullYear() !== Number(anio) || fecha.getUTCMonth() !== Number(mes) - 1 || fecha.getUTCDate() !== Number(dia)) {
    return null
  }
  if (Number(anio) < 1900 || fecha.getTime() > hoy.getTime()) return null
  return valor.trim()
}

function validarFichaNueva(
  raw: Readonly<Record<string, unknown>>,
): { readonly ok: true; readonly ficha: FichaNuevaPareja } | { readonly ok: false; readonly error: ErrorFichaNueva } {
  const cedula = cedulaParaRpc(raw.cedula)
  if (cedula === null) return { ok: false, error: 'CEDULA_INVALIDA' }
  const nombre = nombreValido(raw.nombre)
  const apellido = nombreValido(raw.apellido)
  if (nombre === null || apellido === null) return { ok: false, error: 'NOMBRE_INVALIDO' }
  const email = emailValido(raw.email)
  if (email === null) return { ok: false, error: 'EMAIL_INVALIDO' }
  const fechaNacimiento = fechaNacimientoValida(raw.fechaNacimiento)
  if (fechaNacimiento === null) return { ok: false, error: 'FECHA_NACIMIENTO_INVALIDA' }
  if (!esUnoDe(GENEROS, raw.genero)) return { ok: false, error: 'GENERO_INVALIDO' }
  return { ok: true, ficha: { cedula, nombre, apellido, email, fechaNacimiento, genero: raw.genero } }
}

/**
 * Server-side check of what the browser sent (a server action receives
 * arbitrary data). The RPC stays the authority; this only avoids spending a
 * throttle unit on a cédula that can never match.
 */
export function validarPareja(raw: unknown): ValidacionPareja {
  if (raw === undefined || raw === null) return { ok: true, pareja: null }
  if (!esObjeto(raw)) return { ok: false, error: 'invalid-input' }

  let vinculo: VinculoPareja | undefined
  if (raw.vinculo !== undefined && raw.vinculo !== null) {
    if (!esUnoDe(VINCULOS, raw.vinculo)) return { ok: false, error: 'invalid-input' }
    vinculo = raw.vinculo
  }

  if (raw.modo === 'conyuge_registrado') {
    return { ok: true, pareja: vinculo ? { modo: 'conyuge_registrado', vinculo } : { modo: 'conyuge_registrado' } }
  }
  if (raw.modo === 'ficha_nueva') {
    const ficha = validarFichaNueva(raw)
    if (!ficha.ok) return ficha
    return { ok: true, pareja: { modo: 'ficha_nueva', ...ficha.ficha, ...(vinculo ? { vinculo } : {}) } }
  }
  if (raw.modo !== 'cedula') return { ok: false, error: 'invalid-input' }

  if (raw.conyugeDescartado !== undefined && typeof raw.conyugeDescartado !== 'boolean') {
    return { ok: false, error: 'invalid-input' }
  }
  const cedula = cedulaParaRpc(raw.cedula)
  if (cedula === null) return { ok: false, error: 'CEDULA_INVALIDA' }

  return {
    ok: true,
    pareja: {
      modo: 'cedula',
      cedula,
      ...(vinculo ? { vinculo } : {}),
      ...(raw.conyugeDescartado === true ? { conyugeDescartado: true } : {}),
    },
  }
}

/** Longest first so a code can never shadow a longer one that contains it. */
const ELEVADOS_POR_LARGO: readonly CodigoElevado[] = [...CODIGOS_ELEVADOS].sort((a, b) => b.length - a.length)

const MENSAJE_SIN_PERMISO = 'No tienes permisos para hacer esto.'

/**
 * Translates an RPC error (a RAISE) into a code and a message. Never returns
 * the raw RAISE text or the SQLSTATE.
 */
export function traducirErrorRpcPareja(
  error: { readonly message?: string; readonly code?: string } | null | undefined,
  mensajePorDefecto: string,
): { readonly error: CodigoElevado | 'forbidden' | 'internal'; readonly message: string } {
  const crudo = error?.message ?? ''
  for (const codigo of ELEVADOS_POR_LARGO) {
    if (crudo.includes(codigo)) return { error: codigo, message: MENSAJES_PAREJA[codigo] }
  }
  if (error?.code === '42501') return { error: 'forbidden', message: MENSAJE_SIN_PERMISO }
  return { error: 'internal', message: mensajePorDefecto }
}
