/**
 * Session check of the public QR page (/ninos/registro), R2c: it must never
 * keep the wizard from rendering, so any failure or a slow answer means "signed out".
 */
import { tieneSesionAcotada } from '@/lib/auth/sesion-acotada'

const cliente = (getUser: () => Promise<unknown>) => ({ auth: { getUser } }) as Parameters<typeof tieneSesionAcotada>[0]

describe('tieneSesionAcotada', () => {
  afterEach(() => jest.useRealTimers())

  it('is false without a client', async () => {
    await expect(tieneSesionAcotada(null)).resolves.toBe(false)
  })

  it('is true when there is a user', async () => {
    await expect(tieneSesionAcotada(cliente(async () => ({ data: { user: { id: 'u-1' } }, error: null })))).resolves.toBe(true)
  })

  it('is false when there is no user', async () => {
    await expect(tieneSesionAcotada(cliente(async () => ({ data: { user: null }, error: null })))).resolves.toBe(false)
  })

  it('is false when the lookup rejects', async () => {
    await expect(tieneSesionAcotada(cliente(() => Promise.reject(new Error('caído'))))).resolves.toBe(false)
  })

  it('is false once the time bound passes when the lookup hangs', async () => {
    jest.useFakeTimers()
    const resultado = tieneSesionAcotada(cliente(() => new Promise(() => {})), 1500)
    jest.advanceTimersByTime(1500)
    await expect(resultado).resolves.toBe(false)
  })
})
