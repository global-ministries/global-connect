/**
 * @jest-environment node
 *
 * sendEmail: passes the idempotency key to Resend and, on failure, logs the
 * subject and the error but never the recipient address.
 */
import { createElement } from 'react'

const enviar = jest.fn()
jest.mock('@/lib/email/resend', () => ({
  getResendClient: () => ({ emails: { send: enviar } }),
  EMAIL_FROM: 'GlobalConnect <team@example.test>',
}))
jest.mock('@react-email/render', () => ({ render: jest.fn().mockResolvedValue('<p>hola</p>') }))

import { sendEmail } from '@/lib/email/send'

const template = createElement('p', null, 'hola')

beforeEach(() => jest.clearAllMocks())

describe('sendEmail', () => {
  it('sends with the idempotency key and returns the id', async () => {
    enviar.mockResolvedValue({ data: { id: 'e1' }, error: null })
    await expect(sendEmail({ to: 'ana@example.test', subject: 'Hola', template, idempotencyKey: 'k1' })).resolves.toEqual({
      success: true,
      id: 'e1',
    })
    expect(enviar).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['ana@example.test'], subject: 'Hola', html: '<p>hola</p>' }),
      { idempotencyKey: 'k1' },
    )
  })

  it('logs the failure without the recipient address', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    enviar.mockResolvedValue({ data: null, error: { message: 'rate limited' } })
    await expect(sendEmail({ to: ['ana@example.test', 'luis@example.test'], subject: 'Hola', template })).resolves.toEqual({
      success: false,
      error: 'rate limited',
    })
    expect(log).toHaveBeenCalledWith('[Email] Error enviando:', { destinatarios: 2, subject: 'Hola', error: 'rate limited' })
    expect(JSON.stringify(log.mock.calls)).not.toContain('@example.test')
    log.mockRestore()
  })
})
