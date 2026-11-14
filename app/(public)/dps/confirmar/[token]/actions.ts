'use server'

/**
 * DPS — the «Confirmar» button of the public confirm page
 * (odd/tasks/dps-asistencia-pco.md, T16b; S14.2, S14.5). No session: the
 * token is the only key. It confirms through dps_aviso_token_confirmar with
 * the service client (the confirm RPCs are service_role only), which
 * confirms only the notice version the e-mail was sent with, never undoes a
 * «No puedo» and never after the plan's date. A malformed token never
 * reaches the database. Logs carry no token.
 */
import { confirmarEnlace, enlaceVacio, esTokenConFormato, type ClienteAdminDps, type ServicioEnlace } from '@/lib/platform/dps/avisos-correo'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export async function confirmarServicioPorEnlace(token: string): Promise<ServicioEnlace> {
  if (!esTokenConFormato(token)) return enlaceVacio('invalido')
  try {
    return await confirmarEnlace(createSupabaseAdminClient() as unknown as ClienteAdminDps, token)
  } catch {
    console.error('[dps-confirmar] No se pudo confirmar')
    return enlaceVacio('error')
  }
}
