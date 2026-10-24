/**
 * T5 (odd/tasks/uno-a-uno.md) — the reminder job route (S5.3, S5.7): Bearer
 * secret, accion=encolar queues tomorrow's 1:1s, the default drains one batch,
 * and the response carries only counts.
 */

import { GET, POST } from '@/app/api/uno-a-uno/recordatorios/route'
import { encolarRecordatorios, enviarRecordatorios } from '@/lib/uno-a-uno/recordatorios'

jest.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: jest.fn(() => ({ admin: true })),
}))

jest.mock('@/lib/uno-a-uno/recordatorios', () => ({
  encolarRecordatorios: jest.fn(),
  enviarRecordatorios: jest.fn(),
}))

const mockEncolar = encolarRecordatorios as jest.MockedFunction<typeof encolarRecordatorios>
const mockEnviar = enviarRecordatorios as jest.MockedFunction<typeof enviarRecordatorios>

class TestResponseClass {
  status: number

  private readonly body: unknown

  constructor(body: unknown, init?: ResponseInit) {
    this.body = body
    this.status = init?.status ?? 200
  }

  static json(body: unknown, init?: ResponseInit) {
    return new TestResponseClass(body, init)
  }

  async json() {
    return this.body
  }
}

const TestResponse = TestResponseClass as unknown as typeof Response
const URL_RUTA = 'https://connect.example/api/uno-a-uno/recordatorios'

function pedido(query = '', authorization?: string): Request {
  const headers = new Headers(authorization ? [['authorization', authorization]] : [])
  return { url: `${URL_RUTA}${query}`, headers } as Request
}

describe('uno a uno reminders route', () => {
  beforeAll(() => {
    if (typeof Response === 'undefined') {
      Object.defineProperty(globalThis, 'Response', { value: TestResponse, configurable: true })
    }
  })

  beforeEach(() => {
    delete process.env.UNO_A_UNO_RECORDATORIOS_SECRET
    mockEncolar.mockReset()
    mockEnviar.mockReset()
  })

  it('answers 503 when the secret is not configured', async () => {
    const response = await POST(pedido('', 'Bearer secret-1'))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: 'Uno a uno reminders are not configured' })
    expect(mockEnviar).not.toHaveBeenCalled()
  })

  it.each([
    ['no header', undefined],
    ['a wrong secret', 'Bearer secret-2'],
    ['a secret of another length', 'Bearer secret-10'],
  ])('answers 401 with %s', async (_caso, authorization) => {
    process.env.UNO_A_UNO_RECORDATORIOS_SECRET = 'secret-1'

    const response = await GET(pedido('?accion=encolar', authorization))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized uno a uno reminders request' })
    expect(mockEncolar).not.toHaveBeenCalled()
    expect(mockEnviar).not.toHaveBeenCalled()
  })

  it('drains one batch by default and returns only the counts', async () => {
    process.env.UNO_A_UNO_RECORDATORIOS_SECRET = 'secret-1'
    mockEnviar.mockResolvedValue({ reclamados: 3, enviados: 2, fallidos: 1 })

    const response = await GET(pedido('', 'Bearer secret-1'))

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({ reclamados: 3, enviados: 2, fallidos: 1 })
    expect(mockEnviar).toHaveBeenCalledWith({ admin: true })
    expect(mockEncolar).not.toHaveBeenCalled()
  })

  it('drains one batch with accion=enviar', async () => {
    process.env.UNO_A_UNO_RECORDATORIOS_SECRET = 'secret-1'
    mockEnviar.mockResolvedValue({ reclamados: 0, enviados: 0, fallidos: 0 })

    const response = await POST(pedido('?accion=enviar', 'Bearer secret-1'))

    expect(response.status).toBe(202)
    expect(mockEnviar).toHaveBeenCalledTimes(1)
  })

  it('queues with accion=encolar', async () => {
    process.env.UNO_A_UNO_RECORDATORIOS_SECRET = 'secret-1'
    mockEncolar.mockResolvedValue({ encolados: 4 })

    const response = await POST(pedido('?accion=encolar', 'Bearer secret-1'))

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({ encolados: 4 })
    expect(mockEncolar).toHaveBeenCalledWith({ admin: true })
    expect(mockEnviar).not.toHaveBeenCalled()
  })

  it('answers 400 for an unknown accion', async () => {
    process.env.UNO_A_UNO_RECORDATORIOS_SECRET = 'secret-1'

    const response = await POST(pedido('?accion=borrar', 'Bearer secret-1'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Unknown accion' })
    expect(mockEncolar).not.toHaveBeenCalled()
    expect(mockEnviar).not.toHaveBeenCalled()
  })

  it.each([
    ['encolar', '?accion=encolar'],
    ['enviar', ''],
  ])('answers 500 when %s fails', async (_accion, query) => {
    process.env.UNO_A_UNO_RECORDATORIOS_SECRET = 'secret-1'
    mockEncolar.mockRejectedValue(new Error('boom'))
    mockEnviar.mockRejectedValue(new Error('boom'))
    const consola = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await POST(pedido(query, 'Bearer secret-1'))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Uno a uno reminders failed' })
    consola.mockRestore()
  })
})
