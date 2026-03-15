"use server"

import { getResendClient, EMAIL_FROM } from './resend'
import type { ReactElement } from 'react'
import { render } from '@react-email/render'

interface SendEmailParams {
  to: string | string[]
  subject: string
  template: ReactElement
  replyTo?: string
  idempotencyKey?: string
}

interface SendEmailResult {
  success: boolean
  id?: string
  error?: string
}

export async function sendEmail({
  to,
  subject,
  template,
  replyTo,
  idempotencyKey,
}: SendEmailParams): Promise<SendEmailResult> {
  const resend = getResendClient()
  const html = await render(template)

  const { data, error } = await resend.emails.send(
    {
      from: EMAIL_FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
    },
    idempotencyKey ? { idempotencyKey } : undefined
  )

  if (error) {
    console.error('[Email] Error enviando:', {
      to,
      subject,
      error: error.message,
    })
    return { success: false, error: error.message }
  }

  return { success: true, id: data?.id }
}
