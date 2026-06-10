import { renderToStaticMarkup } from 'react-dom/server'

import {
  SupportTicketCreatedEmail,
  SupportTicketMessageEmail,
  SupportTicketStatusChangedEmail,
} from '@/emails/support-ticket'
import {
  sendSupportTicketCreatedEmail,
  sendSupportTicketMessageEmail,
  sendSupportTicketStatusChangedEmail,
} from '@/lib/email/support'
import { sendEmail } from '@/lib/email/send'

jest.mock('@/lib/email/send', () => ({ sendEmail: jest.fn() }))

const sendEmailMock = jest.mocked(sendEmail)

describe('support email helpers', () => {
  beforeEach(() => {
    sendEmailMock.mockReset()
    process.env.NEXT_PUBLIC_SITE_URL = 'https://connect.yosoyglobal.org'
  })

  it('sends a ticket creation acknowledgement with an authenticated app link only', async () => {
    sendEmailMock.mockResolvedValue({ success: true, id: 'email-1' })

    await expect(sendSupportTicketCreatedEmail({
      recipientEmail: 'reporter@example.com',
      recipientName: 'Isaac',
      ticketId: 'ticket-1',
      ticketNumber: 42,
      title: 'Cannot open group map',
      status: 'received',
      idempotencyKey: 'email:event-1:reporter@example.com',
    })).resolves.toEqual({ success: true, id: 'email-1' })

    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'reporter@example.com',
      subject: 'Recibimos tu solicitud #42',
      idempotencyKey: 'email:event-1:reporter@example.com',
    }))
    const html = renderToStaticMarkup(sendEmailMock.mock.calls[0][0].template)
    expect(html).toContain('https://connect.yosoyglobal.org/ayuda/tickets/ticket-1')
    expect(html).toContain('Cannot open group map')
    expect(html).not.toContain('sentry')
    expect(html).not.toContain('attachment')
    expect(html).not.toContain('github')
    expect(html).not.toContain('support/ticket-1')
  })

  it('encodes special-character ticket IDs in authenticated app links', async () => {
    sendEmailMock.mockResolvedValue({ success: true, id: 'email-special-id' })

    await sendSupportTicketCreatedEmail({
      recipientEmail: 'reporter@example.com',
      ticketId: 'ticket/with spaces?x=1&next=https://evil.test',
      ticketNumber: 46,
      title: 'Link encoding check',
      status: 'received',
    })

    const html = renderToStaticMarkup(sendEmailMock.mock.calls[0][0].template)
    expect(html).toContain(
      'https://connect.yosoyglobal.org/ayuda/tickets/ticket%2Fwith%20spaces%3Fx%3D1%26next%3Dhttps%3A%2F%2Fevil.test'
    )
    expect(html).not.toContain('/ayuda/tickets/ticket/with spaces')
  })

  it('sends a new message notification without message body or diagnostics', async () => {
    sendEmailMock.mockResolvedValue({ success: true, id: 'email-2' })

    await sendSupportTicketMessageEmail({
      recipientEmail: 'reporter@example.com',
      recipientName: 'Isaac',
      ticketId: 'ticket-2',
      ticketNumber: 43,
      title: 'Attendance issue',
      status: 'in_progress',
      idempotencyKey: 'email:event-2:reporter@example.com',
    })

    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'reporter@example.com',
      subject: 'Nueva respuesta en tu solicitud #43',
    }))
    const html = renderToStaticMarkup(sendEmailMock.mock.calls[0][0].template)
    expect(html).toContain('https://connect.yosoyglobal.org/ayuda/tickets/ticket-2')
    expect(html).not.toContain('I can reproduce it')
    expect(html).not.toContain('Chrome')
    expect(html).not.toContain('rawSentryPayload')
  })

  it('sends a status change notification with the safe status label', async () => {
    sendEmailMock.mockResolvedValue({ success: true, id: 'email-3' })

    await sendSupportTicketStatusChangedEmail({
      recipientEmail: 'reporter@example.com',
      recipientName: 'Isaac',
      ticketId: 'ticket-3',
      ticketNumber: 44,
      title: 'Cannot save profile',
      status: 'resolved',
      idempotencyKey: 'email:event-3:reporter@example.com',
    })

    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      subject: 'Actualizamos tu solicitud #44',
    }))
    const html = renderToStaticMarkup(sendEmailMock.mock.calls[0][0].template)
    expect(html).toContain('Resuelto')
    expect(html).toContain('/ayuda/tickets/ticket-3')
  })

  it('renders support templates without unsafe evidence, attachments, R2 keys, or GitHub details', async () => {
    const sharedProps = {
      recipientName: 'Isaac',
      ticketNumber: 45,
      title: 'Map fails after login',
      status: 'received' as const,
      ticketUrl: 'https://connect.yosoyglobal.org/ayuda/tickets/ticket-4',
    }

    const html = [
      renderToStaticMarkup(<SupportTicketCreatedEmail {...sharedProps} />),
      renderToStaticMarkup(<SupportTicketMessageEmail {...sharedProps} />),
      renderToStaticMarkup(<SupportTicketStatusChangedEmail {...sharedProps} status="closed" />),
    ].join('\n')

    expect(html).toContain('Map fails after login')
    expect(html).toContain('https://connect.yosoyglobal.org/ayuda/tickets/ticket-4')
    expect(html).not.toMatch(/sentry|diagnostic|evidence|attachment|github|support\/ticket-4|r2/i)
  })
})
