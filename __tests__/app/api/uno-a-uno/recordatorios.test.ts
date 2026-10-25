/**
 * T5 / T5.2 (odd/tasks/uno-a-uno.md) — the reminder job route (S5.10, S5.13):
 * Bearer secret; the default (accion=procesar) queues tomorrow's 1:1s and then
 * sends one batch; accion=encolar and accion=enviar do one step each for
 * manual use; the response carries only counts.
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

  it('queues and then sends one batch by default, returning both counts (S5.10)', async () => {
    process.env.UNO_A_UNO_RECORDATORIOS_SECRET = 'secret-1'
    const orden: string[] = []
    mockEncolar.mockImplementation(async () => {
      orden.push('encolar')
      return { encolados: 4 }
    })
    mockEnviar.mockImplementation(async () => {
      orden.push('enviar')
      return { reclamados: 3, personas: 2, enviados: 1, fallidos: 1 }
    })

    const response = await GET(pedido('', 'Bearer secret-1'))

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({
      encolados: 4,
      reclamados: 3,
      personas: 2,
      enviados: 1,
      fallidos: 1,
    })
    expect(orden).toEqual(['encolar', 'enviar'])
    expect(mockEncolar).toHaveBeenCalledWith({ admin: true })
    expect(mockEnviar).toHaveBeenCalledWith({ admin: true })
  })

  it('does the same with accion=procesar', async () => {
    process.env.UNO_A_UNO_RECORDATORIOS_SECRET = 'secret-1'
    mockEncolar.mockResolvedValue({ encolados: 0 })
    mockEnviar.mockResolvedValue({ reclamados: 0, personas: 0, enviados: 0, fallidos: 0 })

    const response = await POST(pedido('?accion=procesar', 'Bearer secret-1'))

    expect(response.status).toBe(202)
    expect(mockEncolar).toHaveBeenCalledTimes(1)
    expect(mockEnviar).toHaveBeenCalledTimes(1)
  })

  it('only sends one batch with accion=enviar', async () => {
    process.env.UNO_A_UNO_RECORDATORIOS_SECRET = 'secret-1'
    mockEnviar.mockResolvedValue({ reclamados: 1, personas: 1, enviados: 1, fallidos: 0 })

    const response = await POST(pedido('?accion=enviar', 'Bearer secret-1'))

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({ reclamados: 1, personas: 1, enviados: 1, fallidos: 0 })
    expect(mockEnviar).toHaveBeenCalledTimes(1)
    expect(mockEncolar).not.toHaveBeenCalled()
  })

  it('only queues with accion=encolar', async () => {
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
    ['enviar', '?accion=enviar'],
    ['procesar', ''],
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

  it('answers 500 without sending when queueing fails by default', async () => {
    process.env.UNO_A_UNO_RECORDATORIOS_SECRET = 'secret-1'
    mockEncolar.mockRejectedValue(new Error('boom'))
    const consola = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await POST(pedido('', 'Bearer secret-1'))

    expect(response.status).toBe(500)
    expect(mockEnviar).not.toHaveBeenCalled()
    consola.mockRestore()
  })

  it('answers 500 when sending fails after queueing by default', async () => {
    process.env.UNO_A_UNO_RECORDATORIOS_SECRET = 'secret-1'
    mockEncolar.mockResolvedValue({ encolados: 1 })
    mockEnviar.mockRejectedValue(new Error('No se pudieron tomar los recordatorios: boom'))
    const consola = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await POST(pedido('', 'Bearer secret-1'))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Uno a uno reminders failed' })
    consola.mockRestore()
  })
})
