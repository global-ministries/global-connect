/**
 * Server wiring for the Niños parent emails (N9): the user's Supabase
 * client for ninos_correos_visita and sendEmail with the React Email
 * templates. See lib/platform/ninos/notificaciones.ts.
 */
import { createElement } from 'react'

import { sendEmail } from '@/lib/email/send'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { NinosIngresoEmail } from '@/lib/email/ninos-ingreso-email'
import { NinosRetiroEmail } from '@/lib/email/ninos-retiro-email'
import type { DependenciasAvisos } from '@/lib/platform/ninos/notificaciones'

type Rpc = DependenciasAvisos['rpc']

/** The generated client types each RPC name; these helpers take any name. */
export const rpcSinTipos = (cliente: { rpc: unknown }): Rpc =>
  (cliente.rpc as (...a: unknown[]) => ReturnType<Rpc>).bind(cliente) as Rpc

export function dependenciasAvisos(cliente: { rpc: unknown }): DependenciasAvisos {
  return {
    rpc: rpcSinTipos(cliente),
    enviar: (a) =>
      sendEmail({
        to: a.to,
        subject: a.subject,
        template:
          a.evento === 'ingreso'
            ? createElement(NinosIngresoEmail, { lineas: a.lineas, codigo: a.codigo })
            : createElement(NinosRetiroEmail, { lineas: a.lineas }),
        idempotencyKey: a.idempotencyKey,
      }),
  }
}

export async function sesion() {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()
  return error || !data?.user ? null : supabase
}
