/**
 * Browser side of POST /api/talleres/reserva/* (T5b). Every answer carries an
 * `estado`; a network failure or an unreadable answer reads as `error` with
 * the message to show, so the flow never throws.
 */
import { MENSAJES } from '@/lib/platform/talleres/reserva-publica'

export type RutaReserva = 'identificar' | 'codigo/verificar' | 'codigo/reenviar' | 'crear' | 'avisame'

export interface RespuestaReserva {
  readonly estado: string
  readonly mensaje?: string
  readonly [clave: string]: unknown
}

export async function postReserva(ruta: RutaReserva, cuerpo: Record<string, unknown>): Promise<RespuestaReserva> {
  try {
    const res = await fetch(`/api/talleres/reserva/${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
    const json = (await res.json().catch(() => null)) as RespuestaReserva | null
    return json && typeof json.estado === 'string' ? json : { estado: 'error', mensaje: MENSAJES.error }
  } catch {
    return { estado: 'error', mensaje: MENSAJES.red }
  }
}

export const texto = (v: unknown): string => (typeof v === 'string' ? v : '')
export const numero = (v: unknown): number | null => (typeof v === 'number' ? v : null)
