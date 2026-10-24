/**
 * Maps a uno_a_uno_* function error (supabase/migrations/
 * 20261015120000_uno_a_uno_modelo.sql) to the {error, message} the server
 * actions return. The functions already raise Spanish, user-facing messages;
 * only those known messages are passed through, never a raw Postgres one.
 */

export interface ErrorUnoAUno {
  readonly error: 'unauthorized' | 'forbidden' | 'invalid-input' | 'not-found' | 'unknown'
  readonly message: string
}

const SIN_SESION_DB = 'Debes iniciar sesión.'

const MENSAJES_CONOCIDOS: ReadonlySet<string> = new Set([
  'No lideras a esta persona.',
  'Solo quien lidera este 1 a 1 puede cambiarlo.',
  'La fecha del 1 a 1 debe ser futura.',
  'La fecha de un 1 a 1 realizado no puede ser futura.',
  'El resumen es obligatorio.',
  'Este 1 a 1 ya no está agendado.',
  'No encontramos este 1 a 1.',
  'La celebración no puede superar 500 caracteres.',
])

export const MENSAJE_SIN_SESION = 'Necesitas iniciar sesión.'

function conocido(message: string | undefined, fallback: string): string {
  return message && MENSAJES_CONOCIDOS.has(message) ? message : fallback
}

export function traducirErrorUnoAUno(
  error: { readonly code?: string; readonly message?: string },
  fallback: string,
): ErrorUnoAUno {
  switch (error.code) {
    case '42501':
      if (error.message === SIN_SESION_DB) return { error: 'unauthorized', message: MENSAJE_SIN_SESION }
      return { error: 'forbidden', message: conocido(error.message, 'No tienes permiso para hacer esto.') }
    case '22023':
      return { error: 'invalid-input', message: conocido(error.message, 'Revisa los datos e inténtalo de nuevo.') }
    case 'P0002':
      return { error: 'not-found', message: 'No encontramos este 1 a 1.' }
    default:
      return { error: 'unknown', message: fallback }
  }
}

/** Text limits shared by the dialogs (maxLength) and the server actions. */
export const LIMITES_UNO_A_UNO = {
  lugar: 200,
  resumen: 4000,
  notaPrivada: 4000,
  motivo: 300,
  celebracion: 500,
} as const
