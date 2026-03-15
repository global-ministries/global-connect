"use server"

import { sendEmail } from '@/lib/email/send'
import { BienvenidaEmail } from '@/emails/bienvenida'
import { InvitacionGrupoEmail } from '@/emails/invitacion-grupo'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Envía un email de bienvenida tras el registro exitoso.
 */
export async function enviarEmailBienvenida(params: {
  email: string
  nombreUsuario: string
}) {
  return await sendEmail({
    to: params.email,
    subject: '¡Bienvenido a GlobalConnect!',
    template: BienvenidaEmail({
      nombreUsuario: params.nombreUsuario,
      dashboardUrl: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://connect.yosoyglobal.org'}/dashboard`,
    }),
    idempotencyKey: `bienvenida-${params.email}`,
  })
}

/**
 * Envía una invitación a un grupo. Requiere autenticación.
 */
export async function enviarInvitacionGrupo(params: {
  email: string
  nombreUsuario: string
  nombreGrupo: string
  token: string
}) {
  // Verificar que el usuario actual está autenticado
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'No autenticado' }
  }

  return await sendEmail({
    to: params.email,
    subject: `Invitación para unirte a ${params.nombreGrupo}`,
    template: InvitacionGrupoEmail({
      nombreUsuario: params.nombreUsuario,
      nombreGrupo: params.nombreGrupo,
      urlAceptar: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://connect.yosoyglobal.org'}/invitacion/${params.token}`,
    }),
    idempotencyKey: `invitacion-${params.token}`,
  })
}
