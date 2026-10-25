import type { ReactElement } from 'react'
import { render } from '@react-email/render'

import { getResendClient, EMAIL_FROM } from './resend'

export interface EmailDeLote {
  to: string
  subject: string
  template: ReactElement
}

export interface ErrorDeLote {
  /** Position of the failed email in the batch. */
  index: number
  message: string
}

export type SendEmailBatchResult = { success: true; errors: ErrorDeLote[] } | { success: false; error: string }

/**
 * Sends up to 100 emails in ONE Resend batch request (odd/tasks/uno-a-uno.md,
 * T5.2, S5.9). Permissive validation lets the valid emails go out and returns
 * the invalid ones by index; a failed request (429, 5xx) comes back as one
 * error so the caller can retry every email of it.
 */
export async function sendEmailBatch(
  emails: EmailDeLote[],
  { idempotencyKey }: { idempotencyKey: string },
): Promise<SendEmailBatchResult> {
  if (emails.length === 0) return { success: true, errors: [] }

  const resend = getResendClient()
  const payload = await Promise.all(
    emails.map(async ({ to, subject, template }) => ({
      from: EMAIL_FROM,
      to: [to],
      subject,
      html: await render(template),
    })),
  )

  const { data, error } = await resend.batch.send(payload, { idempotencyKey, batchValidation: 'permissive' })

  if (error) {
    // Never log the recipient addresses (personal data); the count is enough to triage.
    console.error('[Email] Error enviando lote:', { emails: emails.length, error: error.message })
    return { success: false, error: error.message }
  }

  return { success: true, errors: data?.errors ?? [] }
}
