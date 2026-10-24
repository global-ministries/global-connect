'use server'

/**
 * T4 (odd/tasks/uno-a-uno.md) — server actions for /mis-uno-a-uno: schedule,
 * register (scheduled or not), reschedule and cancel a 1:1.
 *
 * Gate: an authenticated session only. Who may act is decided in the
 * database: every uno_a_uno_* function checks the caller against
 * mis_dirigidos() or the 1:1's leader side and raises 42501 / 22023 / P0002
 * (supabase/migrations/20261015120000_uno_a_uno_modelo.sql), mapped to
 * Spanish by lib/uno-a-uno/errores.ts. Dates arrive as a Caracas date and
 * time and are turned into a timestamptz here, never trusted pre-built.
 * T7: both register actions take an optional celebración
 * (20261024120000_uno_a_uno_supervision.sql).
 */

import { revalidatePath } from 'next/cache'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { LIMITES_UNO_A_UNO, MENSAJE_SIN_SESION, traducirErrorUnoAUno } from '@/lib/uno-a-uno/errores'
import { fechaHoraCaracasAIso } from '@/lib/uno-a-uno/fecha'

export type UnoAUnoActionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string; readonly message: string }

type Cliente = Awaited<ReturnType<typeof createSupabaseServerClient>>

const RUTA = '/mis-uno-a-uno'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

class EntradaInvalida extends Error {}

function invalido(message: string): never {
  throw new EntradaInvalida(message)
}

function uuid(value: unknown, message: string): string {
  return typeof value === 'string' && UUID_RE.test(value) ? value : invalido(message)
}

function fechaHora(fecha: unknown, hora: unknown): string {
  if (typeof fecha !== 'string' || typeof hora !== 'string' || !fecha.trim() || !hora.trim()) {
    return invalido('Elige la fecha y la hora.')
  }
  return fechaHoraCaracasAIso(fecha.trim(), hora.trim()) ?? invalido('La fecha o la hora no son válidas.')
}

/** Trimmed text, null when blank; rejects anything over `max`. */
function opcional(value: unknown, max: number, campo: string): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return invalido(`${campo} no es válido.`)
  const trimmed = value.trim()
  if (trimmed.length > max) return invalido(`${campo} admite hasta ${max} caracteres.`)
  return trimmed || null
}

function resumen(value: unknown): string {
  return opcional(value, LIMITES_UNO_A_UNO.resumen, 'El resumen') ?? invalido('El resumen es obligatorio.')
}

function celebracion(value: unknown): string | null {
  return opcional(value, LIMITES_UNO_A_UNO.celebracion, 'La celebración')
}

/**
 * Session gate, input parsing and error mapping shared by every action.
 * `parse` throws EntradaInvalida for bad input; `run` calls the RPC.
 */
async function ejecutar<T>(
  parse: () => T,
  run: (client: Cliente, input: T) => PromiseLike<{ error: { code?: string; message?: string } | null }>,
  fallback: string,
): Promise<UnoAUnoActionResult> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized', message: MENSAJE_SIN_SESION }

  let input: T
  try {
    input = parse()
  } catch (err) {
    if (err instanceof EntradaInvalida) return { ok: false, error: 'invalid-input', message: err.message }
    throw err
  }

  const { error } = await run(supabase, input)
  if (error) {
    const traducido = traducirErrorUnoAUno(error, fallback)
    return { ok: false, error: traducido.error, message: traducido.message }
  }

  revalidatePath(RUTA)
  return { ok: true }
}

export interface AgendarUnoAUnoInput {
  readonly dirigidoId: string
  readonly fecha: string
  readonly hora: string
  readonly lugar?: string | null
}

export async function agendarUnoAUno(input: AgendarUnoAUnoInput): Promise<UnoAUnoActionResult> {
  return ejecutar(
    () => ({
      p_dirigido_id: uuid(input.dirigidoId, 'Elige a la persona.'),
      p_fecha_hora: fechaHora(input.fecha, input.hora),
      p_lugar: opcional(input.lugar, LIMITES_UNO_A_UNO.lugar, 'El lugar'),
    }),
    (client, args) => client.rpc('uno_a_uno_agendar', args),
    'No se pudo agendar el 1 a 1.',
  )
}

export interface RegistrarUnoAUnoInput {
  readonly id: string
  readonly resumen: string
  readonly notaPrivada?: string | null
  readonly celebracion?: string | null
}

export async function registrarUnoAUno(input: RegistrarUnoAUnoInput): Promise<UnoAUnoActionResult> {
  return ejecutar(
    () => ({
      p_id: uuid(input.id, 'No encontramos este 1 a 1.'),
      p_resumen: resumen(input.resumen),
      p_nota_privada: opcional(input.notaPrivada, LIMITES_UNO_A_UNO.notaPrivada, 'La nota privada'),
      p_celebracion: celebracion(input.celebracion),
    }),
    (client, args) => client.rpc('uno_a_uno_registrar', args),
    'No se pudo registrar el 1 a 1.',
  )
}

export interface RegistrarSinAgendaInput {
  readonly dirigidoId: string
  readonly fecha: string
  readonly hora: string
  readonly resumen: string
  readonly notaPrivada?: string | null
  readonly celebracion?: string | null
  readonly lugar?: string | null
}

export async function registrarSinAgenda(input: RegistrarSinAgendaInput): Promise<UnoAUnoActionResult> {
  return ejecutar(
    () => ({
      p_dirigido_id: uuid(input.dirigidoId, 'Elige a la persona.'),
      p_fecha_hora: fechaHora(input.fecha, input.hora),
      p_resumen: resumen(input.resumen),
      p_nota_privada: opcional(input.notaPrivada, LIMITES_UNO_A_UNO.notaPrivada, 'La nota privada'),
      p_lugar: opcional(input.lugar, LIMITES_UNO_A_UNO.lugar, 'El lugar'),
      p_celebracion: celebracion(input.celebracion),
    }),
    (client, args) => client.rpc('uno_a_uno_registrar_sin_agenda', args),
    'No se pudo registrar el 1 a 1.',
  )
}

export interface ReprogramarUnoAUnoInput {
  readonly id: string
  readonly fecha: string
  readonly hora: string
}

export async function reprogramarUnoAUno(input: ReprogramarUnoAUnoInput): Promise<UnoAUnoActionResult> {
  return ejecutar(
    () => ({
      p_id: uuid(input.id, 'No encontramos este 1 a 1.'),
      p_fecha_hora: fechaHora(input.fecha, input.hora),
    }),
    (client, args) => client.rpc('uno_a_uno_reprogramar', args),
    'No se pudo reprogramar el 1 a 1.',
  )
}

export interface CancelarUnoAUnoInput {
  readonly id: string
  readonly motivo?: string | null
}

export async function cancelarUnoAUno(input: CancelarUnoAUnoInput): Promise<UnoAUnoActionResult> {
  return ejecutar(
    () => ({
      p_id: uuid(input.id, 'No encontramos este 1 a 1.'),
      p_motivo: opcional(input.motivo, LIMITES_UNO_A_UNO.motivo, 'El motivo'),
    }),
    (client, args) => client.rpc('uno_a_uno_cancelar', args),
    'No se pudo cancelar el 1 a 1.',
  )
}
