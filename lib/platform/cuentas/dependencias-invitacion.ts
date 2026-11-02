/**
 * Server wiring of the account invitation dependencies, shared by
 * /api/users/[id]/invitacion-cuenta and /api/invitaciones-cuenta/*: the
 * session client (the caller, whom the database checks), the service client
 * for auth accounts, and the branded email. Server-only: it creates the
 * service client.
 */
import { createElement } from 'react'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/send'
import { InvitacionCuentaEmail } from '@/lib/email/invitacion-cuenta-email'
import type { DependenciasInvitacion } from '@/lib/platform/cuentas/invitacion-cuenta'

// The functions are not in the generated database types yet, so the call is untyped.
type Rpc = DependenciasInvitacion['rpcUsuario']
export const rpcSinTipos = (cliente: { rpc: unknown }): Rpc =>
  (cliente.rpc as (...a: unknown[]) => ReturnType<Rpc>).bind(cliente) as Rpc

/** The session client of the signed-in caller, or null without a session. */
export async function sesion() {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()
  return error || !data?.user ? null : supabase
}

export function dependencias(supabase: { rpc: unknown }): DependenciasInvitacion {
  const admin = createSupabaseAdminClient()
  return {
    rpcUsuario: rpcSinTipos(supabase),
    admin: {
      rpc: rpcSinTipos(admin),
      obtenerUsuario: async (id) => {
        const { data, error } = await admin.auth.admin.getUserById(id)
        if (error || !data?.user) return null
        return { email: data.user.email ?? '', email_confirmed_at: data.user.email_confirmed_at ?? null }
      },
      borrarUsuario: async (id) => {
        const { error } = await admin.auth.admin.deleteUser(id)
        return { error: error ? { message: error.message } : null }
      },
      generarEnlace: async ({ tipo, email, datos }) => {
        const { data, error } = await admin.auth.admin.generateLink({ type: tipo, email, options: { data: datos } })
        if (error || !data?.user || !data.properties?.hashed_token) {
          return { data: null, error: { message: error?.message ?? 'sin enlace' } }
        }
        return { data: { userId: data.user.id, hashedToken: data.properties.hashed_token }, error: null }
      },
    },
    enviarCorreo: ({ to, subject, nombre, enlace, idempotencyKey }) =>
      sendEmail({
        to,
        subject,
        template: createElement(InvitacionCuentaEmail, { nombre, urlAceptar: enlace }),
        idempotencyKey,
      }),
    urlBase: urlBaseSitio(),
  }
}

// The configured site URL wins; a Vercel preview falls back to its own branch URL
// so the invite link opens the deployment that sent it.
export function urlBaseSitio(): string {
  const configurada = process.env.NEXT_PUBLIC_SITE_URL
  if (configurada) return configurada.replace(/\/+$/, '')
  const vercel = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`
  return 'https://miembros.yosoyglobal.org'
}
