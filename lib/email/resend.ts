import { Resend } from 'resend'

let resendInstance: Resend | null = null

export function getResendClient(): Resend {
  if (!resendInstance) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error('RESEND_API_KEY no está configurada')
    }
    resendInstance = new Resend(apiKey)
  }
  return resendInstance
}

export const EMAIL_FROM = `${process.env.RESEND_FROM_NAME || 'GlobalConnect'} <${process.env.RESEND_FROM_EMAIL || 'team@connect.yosoyglobal.org'}>`
