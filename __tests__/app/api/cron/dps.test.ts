/**
 * T16b (odd/tasks/dps-asistencia-pco.md, S14.1, S14.4) — the daily DPS cron
 * route /api/cron/dps: the safety net of the e-mail outbox (the immediate
 * dispatch after «Enviar avisos» and «No puedo» may leave rows behind).
 * Authenticates exactly like the talleres route: 503 while CRON_SECRET is
 * unset, 401 with a missing or wrong header (the job never runs), 202 with
 * counts only, 500 when a step failed or the job threw.
 */

import { GET, POST } from '@/app/api/cron/dps/route'
import { ejecutarJobDps } from '@/lib/platform/dps/avisos-correo'

jest.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: jest.fn(() => ({ admin: true })),
}))

jest.mock('@/lib/platform/dps/avisos-correo', () => ({
  ejecutarJobDps: jest.fn(),
}))

const mockJob = ejecutarJobDps as jest.MockedFunction<typeof ejecutarJobDps>

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

function pedido(authorization?: string): Request {
  const headers = new Headers(authorization ? [['authorization', authorization]] : [])
  return { url: 'https://connect.example/api/cron/dps', headers } as Request
}

describe('dps cron route', () => {
  beforeAll(() => {
    if (typeof Response === 'undefined') {
      Object.defineProperty(globalThis, 'Response', { value: TestResponse, configurable: true })
    }
  })

  beforeEach(() => {
    delete process.env.CRON_SECRET
    mockJob.mockReset()
  })

  it('is 503 and runs nothing while CRON_SECRET is unset', async () => {
    const respuesta = await GET(pedido('Bearer cualquiera'))
    expect(respuesta.status).toBe(503)
    await expect(respuesta.json()).resolves.toEqual({ error: 'DPS cron is not configured' })
    expect(mockJob).not.toHaveBeenCalled()
  })

  it('is 401 without the header, with a wrong secret, without Bearer or with a longer one', async () => {
    process.env.CRON_SECRET = 'secreto-cron'
    for (const cabecera of [undefined, 'Bearer otro-secreto', 'secreto-cron', 'Bearer secreto-cron-y-mas']) {
      const respuesta = await POST(pedido(cabecera))
      expect(respuesta.status).toBe(401)
      await expect(respuesta.json()).resolves.toEqual({ error: 'Unauthorized DPS cron request' })
    }
    expect(mockJob).not.toHaveBeenCalled()
  })

  it('runs the job once with the admin client and answers 202 with counts only', async () => {
    process.env.CRON_SECRET = 'secreto-cron'
    mockJob.mockResolvedValue({ correos: { reclamados: 3, enviados: 3, fallidos: 0 }, fallos: [] })
    const respuesta = await GET(pedido('Bearer secreto-cron'))
    expect(respuesta.status).toBe(202)
    await expect(respuesta.json()).resolves.toEqual({ correos: { reclamados: 3, enviados: 3, fallidos: 0 }, fallos: [] })
    expect(mockJob).toHaveBeenCalledTimes(1)
    expect(mockJob).toHaveBeenCalledWith({ admin: true })
  })

  it('answers 500 with the counts when a step failed, and 500 without details when the job threw', async () => {
    process.env.CRON_SECRET = 'secreto-cron'
    mockJob.mockResolvedValueOnce({ correos: null, fallos: ['correos'] })
    const fallo = await GET(pedido('Bearer secreto-cron'))
    expect(fallo.status).toBe(500)
    await expect(fallo.json()).resolves.toEqual({ correos: null, fallos: ['correos'] })

    mockJob.mockRejectedValueOnce(new Error('boom'))
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const roto = await GET(pedido('Bearer secreto-cron'))
    error.mockRestore()
    expect(roto.status).toBe(500)
    await expect(roto.json()).resolves.toEqual({ error: 'DPS cron failed' })
  })
})
