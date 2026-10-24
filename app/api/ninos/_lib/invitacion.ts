/**
 * Server wiring of the account invitation sent from the Niños table: the
 * shared flow of lib/platform/cuentas/invitacion-cuenta.ts, whose first step
 * (creating the invitation row) is a Niños RPC bound to one ficha and one
 * operator (ninos_preregistro_invitar or ninos_familia_invitar).
 */
import { createElement } from 'react'

import { DESTINO_MIS_HIJOS, enlaceInvitacionConDestino } from '@/lib/auth/destino-mis-hijos'
import { sendEmail } from '@/lib/email/send'
import { InvitacionCuentaEmail } from '@/lib/email/invitacion-cuenta-email'
import type { DependenciasInvitacion } from '@/lib/platform/cuentas/invitacion-cuenta'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

import { rpcSinTipos } from './avisos'

type RespuestaRpc = Awaited<ReturnType<DependenciasInvitacion['rpcUsuario']>>

export function urlBaseSitio(): string {
  const configurada = process.env.NEXT_PUBLIC_SITE_URL
  if (configurada) return configurada.replace(/\/+$/, '')
  const vercel = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`
  return 'https://miembros.yosoyglobal.org'
}

/**
 * The shared invitation flow with its first step replaced by `crear`, which
 * runs AS THE CALLER and receives only the email: the ficha comes from the
 * route, never from the shared flow's arguments.
 */
export function dependenciasInvitacionNinos(crear: (email: string) => PromiseLike<RespuestaRpc>): DependenciasInvitacion {
  const admin = createSupabaseAdminClient()
  return {
    rpcUsuario: (_nombre, args) => crear(String(args.p_email ?? '')),
    admin: {
      rpc: rpcSinTipos(admin),
      obtenerUsuario: async (uid) => {
        const { data, error } = await admin.auth.admin.getUserById(uid)
        if (error || !data?.user) return null
        return { email: data.user.email ?? '', email_confirmed_at: data.user.email_confirmed_at ?? null }
      },
      borrarUsuario: async (uid) => {
        const { error } = await admin.auth.admin.deleteUser(uid)
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
    // After choosing the password the parent lands on Mi Perfil → Mis hijos (R3b).
    enviarCorreo: ({ to, subject, nombre, enlace, idempotencyKey }) =>
      sendEmail({
        to,
        subject,
        template: createElement(InvitacionCuentaEmail, {
          nombre,
          urlAceptar: enlaceInvitacionConDestino(enlace, DESTINO_MIS_HIJOS),
          deNinos: true,
        }),
        idempotencyKey,
      }),
    urlBase: urlBaseSitio(),
  }
}
