/**
 * @jest-environment node
 *
 * sendEmailBatch (odd/tasks/uno-a-uno.md, T5.2, S5.9): one Resend batch
 * request with permissive validation and the idempotency key; the per-email
 * errors come back by index, a failed request comes back as one error, and
 * the log never carries an address.
 */
import { createElement } from 'react'

const enviarLote = jest.fn()
jest.mock('@/lib/email/resend', () => ({
  getResendClient: () => ({ batch: { send: enviarLote } }),
  EMAIL_FROM: 'GlobalConnect <team@example.test>',
}))
jest.mock('@react-email/render', () => ({
  render: jest.fn(async (template: { props: { children: string } }) => `<p>${template.props.children}</p>`),
}))

import { sendEmailBatch } from '@/lib/email/send-batch'

const EMAILS = [
  { to: 'ana@example.test', subject: 'Hola Ana', template: createElement('p', null, 'ana') },
  { to: 'luis@example.test', subject: 'Hola Luis', template: createElement('p', null, 'luis') },
]

beforeEach(() => jest.clearAllMocks())

describe('sendEmailBatch', () => {
  it('sends every email rendered in ONE request with permissive validation and the key', async () => {
    enviarLote.mockResolvedValue({ data: { data: [{ id: 'e1' }, { id: 'e2' }], errors: [] }, error: null })

    await expect(sendEmailBatch(EMAILS, { idempotencyKey: 'k1' })).resolves.toEqual({ success: true, errors: [] })

    expect(enviarLote).toHaveBeenCalledTimes(1)
    expect(enviarLote).toHaveBeenCalledWith(
      [
        { from: 'GlobalConnect <team@example.test>', to: ['ana@example.test'], subject: 'Hola Ana', html: '<p>ana</p>' },
        { from: 'GlobalConnect <team@example.test>', to: ['luis@example.test'], subject: 'Hola Luis', html: '<p>luis</p>' },
      ],
      { idempotencyKey: 'k1', batchValidation: 'permissive' },
    )
  })

  it('returns the per-email errors by index', async () => {
    enviarLote.mockResolvedValue({
      data: { data: [{ id: 'e1' }], errors: [{ index: 1, message: 'Invalid `to` field.' }] },
      error: null,
    })

    await expect(sendEmailBatch(EMAILS, { idempotencyKey: 'k1' })).resolves.toEqual({
      success: true,
      errors: [{ index: 1, message: 'Invalid `to` field.' }],
    })
  })

  it('treats a response without errors as all sent', async () => {
    enviarLote.mockResolvedValue({ data: { data: [{ id: 'e1' }, { id: 'e2' }] }, error: null })

    await expect(sendEmailBatch(EMAILS, { idempotencyKey: 'k1' })).resolves.toEqual({ success: true, errors: [] })
  })

  it('returns a failed request as one error and logs it without the addresses', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    enviarLote.mockResolvedValue({
      data: null,
      error: { message: 'Too many requests', statusCode: 429, name: 'rate_limit_exceeded' },
    })

    await expect(sendEmailBatch(EMAILS, { idempotencyKey: 'k1' })).resolves.toEqual({
      success: false,
      error: 'Too many requests',
    })
    expect(log).toHaveBeenCalledWith('[Email] Error enviando lote:', { emails: 2, error: 'Too many requests' })
    expect(JSON.stringify(log.mock.calls)).not.toContain('@example.test')
    log.mockRestore()
  })

  it('does not call Resend for an empty batch', async () => {
    await expect(sendEmailBatch([], { idempotencyKey: 'k1' })).resolves.toEqual({ success: true, errors: [] })
    expect(enviarLote).not.toHaveBeenCalled()
  })
})
