"use server"

import { SupportTicketCreatedEmail, SupportTicketMessageEmail, SupportTicketStatusChangedEmail } from '@/emails/support-ticket'
import type { SupportEmailStatus } from '@/emails/support-ticket'
import { sendEmail } from '@/lib/email/send'

interface SupportEmailParams {
  recipientEmail: string
  recipientName?: string
  ticketId: string
  ticketNumber: number
  title: string
  status: SupportEmailStatus
  idempotencyKey?: string
}

export async function sendSupportTicketCreatedEmail(params: SupportEmailParams) {
  return sendEmail({
    to: params.recipientEmail,
    subject: `Recibimos tu solicitud #${params.ticketNumber}`,
    template: SupportTicketCreatedEmail(toTemplateProps(params)),
    idempotencyKey: params.idempotencyKey,
  })
}

export async function sendSupportTicketMessageEmail(params: SupportEmailParams) {
  return sendEmail({
    to: params.recipientEmail,
    subject: `Nueva respuesta en tu solicitud #${params.ticketNumber}`,
    template: SupportTicketMessageEmail(toTemplateProps(params)),
    idempotencyKey: params.idempotencyKey,
  })
}

export async function sendSupportTicketStatusChangedEmail(params: SupportEmailParams) {
  return sendEmail({
    to: params.recipientEmail,
    subject: `Actualizamos tu solicitud #${params.ticketNumber}`,
    template: SupportTicketStatusChangedEmail(toTemplateProps(params)),
    idempotencyKey: params.idempotencyKey,
  })
}

function toTemplateProps(params: SupportEmailParams) {
  return {
    recipientName: params.recipientName,
    ticketNumber: params.ticketNumber,
    title: params.title,
    status: params.status,
    ticketUrl: getSupportTicketUrl(params.ticketId),
  }
}

function getSupportTicketUrl(ticketId: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://connect.yosoyglobal.org'
  const origin = new URL(siteUrl).origin

  return `${origin}/ayuda/tickets/${encodeURIComponent(ticketId)}`
}
