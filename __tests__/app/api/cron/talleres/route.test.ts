/**
 * T7 (odd/tasks/talleres-reserva-publica.md) — the daily talleres cron route:
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; without the
 * secret configured it is 503, with a missing or wrong header 401 and the
 * job never runs; with it the job runs once and the reply is counts only
 * (202, or 500 when a step failed).
 */

import { GET, POST } from '@/app/api/cron/talleres/route'
import { ejecutarJobTalleres } from '@/lib/platform/talleres/avisos-cron'

jest.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: jest.fn(() => ({ admin: true })),
}))

jest.mock('@/lib/platform/talleres/avisos-cron', () => ({
  ejecutarJobTalleres: jest.fn(),
}))

const mockJob = ejecutarJobTalleres as jest.MockedFunction<typeof ejecutarJobTalleres>

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
  return { url: 'https://connect.example/api/cron/talleres', headers } as Request
}

const RESULTADO_OK = {
  confirmacionesVencidas: 2,
  recordatorios: 5,
  correos: { reclamados: 7, enviados: 7, fallidos: 0 },
  limpieza: { codigos: 1, limites: 40 },
  fallos: [],
}

describe('talleres cron route', () => {
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
    expect(mockJob).not.toHaveBeenCalled()
  })

  it('is 401 without an Authorization header', async () => {
    process.env.CRON_SECRET = 'secreto-cron'

    const respuesta = await GET(pedido())

    expect(respuesta.status).toBe(401)
    await expect(respuesta.json()).resolves.toEqual({ error: 'Unauthorized talleres cron request' })
    expect(mockJob).not.toHaveBeenCalled()
  })

  it('is 401 with a wrong secret, a secret without Bearer, or a longer one', async () => {
    process.env.CRON_SECRET = 'secreto-cron'

    for (const cabecera of ['Bearer otro-secreto', 'secreto-cron', 'Bearer secreto-cron-y-mas']) {
      const respuesta = await POST(pedido(cabecera))
      expect(respuesta.status).toBe(401)
    }
    expect(mockJob).not.toHaveBeenCalled()
  })

  it('runs the job once with the admin client and answers the counts (202)', async () => {
    process.env.CRON_SECRET = 'secreto-cron'
    mockJob.mockResolvedValue(RESULTADO_OK)

    const respuesta = await GET(pedido('Bearer secreto-cron'))

    expect(respuesta.status).toBe(202)
    await expect(respuesta.json()).resolves.toEqual(RESULTADO_OK)
    expect(mockJob).toHaveBeenCalledTimes(1)
    expect(mockJob).toHaveBeenCalledWith({ admin: true })
  })

  it('answers 500 with the counts when a step failed', async () => {
    process.env.CRON_SECRET = 'secreto-cron'
    mockJob.mockResolvedValue({ ...RESULTADO_OK, correos: null, fallos: ['correos'] })

    const respuesta = await GET(pedido('Bearer secreto-cron'))

    expect(respuesta.status).toBe(500)
    await expect(respuesta.json()).resolves.toMatchObject({ fallos: ['correos'] })
  })

  it('answers 500 without details when the job throws', async () => {
    process.env.CRON_SECRET = 'secreto-cron'
    mockJob.mockRejectedValue(new Error('boom'))
    const consola = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    const respuesta = await GET(pedido('Bearer secreto-cron'))

    expect(respuesta.status).toBe(500)
    await expect(respuesta.json()).resolves.toEqual({ error: 'Talleres cron failed' })
    consola.mockRestore()
  })
})
