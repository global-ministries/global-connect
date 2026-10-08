/**
 * @jest-environment node
 *
 * N9 — POST /api/ninos/checkin and /api/ninos/checkout: the RPC runs as the
 * user, then the parent emails go out; an email failure never fails the call.
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/email/send', () => ({ sendEmail: jest.fn() }))

import { POST as checkin } from '@/app/api/ninos/checkin/route'
import { POST as checkout } from '@/app/api/ninos/checkout/route'

const createClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const sendEmail = jest.requireMock('@/lib/email/send').sendEmail as jest.Mock

const N1 = '11111111-1111-4111-8111-111111111111'
const S1 = '22222222-2222-4222-8222-222222222222'
const T1 = '33333333-3333-4333-8333-333333333333'
const fila = {
  visita_id: 'v1', padre_id: 'p1', email: 'ana@example.test', padre_nombre: 'Ana', nino_nombre: 'Sofía',
  nino_genero: 'Femenino', salon: 'Preescolar II', codigo: '4821', entrada_at: '2026-10-11T13:05:00Z',
  salida_at: '2026-10-11T14:42:00Z', retirado_por_nombre: 'Ana',
}
let rpc: jest.Mock

function setup(respuestas: Record<string, { data?: unknown; error?: unknown }>, user: object | null = { id: 'auth-1' }) {
  rpc = jest.fn((nombre: string) => Promise.resolve({ data: respuestas[nombre]?.data ?? null, error: respuestas[nombre]?.error ?? null }))
  createClient.mockResolvedValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) }, rpc })
  sendEmail.mockResolvedValue({ success: true })
}

const req = (ruta: string, body: unknown) =>
  new NextRequest(`http://localhost/api/ninos/${ruta}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) })

const cuerpoCheckin = { ninoIds: [N1], salonIds: [S1], turnoId: T1, fecha: '2026-10-11' }
const cuerpoCheckout = { codigo: '4821', turnoId: T1, fecha: '2026-10-11', retiradoPor: 'Ana' }

beforeEach(() => jest.clearAllMocks())

describe('POST /api/ninos/checkin', () => {
  it('401 without a session', async () => {
    setup({}, null)
    expect((await checkin(req('checkin', cuerpoCheckin))).status).toBe(401)
  })

  it('400 for a malformed body, nothing called', async () => {
    setup({})
    expect((await checkin(req('checkin', { ...cuerpoCheckin, salonIds: [] }))).status).toBe(400)
    expect((await checkin(req('checkin', { ...cuerpoCheckin, fecha: 'ayer' }))).status).toBe(400)
    expect((await checkin(req('checkin', '{x'))).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('calls ninos_checkin as the user, returns its rows and emails the parents once per visit', async () => {
    const filas = [{ nino_id: N1, salon_id: S1, codigo: '4821', ocupacion: 3, capacidad: 20, sobre_capacidad: false }]
    setup({ ninos_checkin: { data: filas }, ninos_correos_visita: { data: [fila] } })
    const res = await checkin(req('checkin', cuerpoCheckin))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ filas })
    expect(rpc).toHaveBeenCalledWith('ninos_checkin', { p_nino_ids: [N1], p_salon_ids: [S1], p_turno_id: T1, p_fecha: '2026-10-11' })
    expect(rpc).toHaveBeenCalledWith('ninos_correos_visita', { p_nino_ids: [N1], p_turno_id: T1, p_fecha: '2026-10-11', p_evento: 'ingreso' })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ana@example.test', idempotencyKey: 'ninos-ingreso-v1-p1' }))
  })

  it('passes the RPC error code through for the screen messages, no email', async () => {
    setup({ ninos_checkin: { error: { code: '23505', message: 'a child is already checked in' } } })
    const res = await checkin(req('checkin', cuerpoCheckin))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: { code: '23505' } })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('the check-in succeeds even when the email fails', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    setup({ ninos_checkin: { data: [{ nino_id: N1, salon_id: S1, codigo: '4821' }] }, ninos_correos_visita: { data: [fila] } })
    sendEmail.mockRejectedValue(new Error('resend down'))
    expect((await checkin(req('checkin', cuerpoCheckin))).status).toBe(200)
    expect(JSON.stringify(log.mock.calls)).not.toContain('ana@example.test')
    log.mockRestore()
  })
})

describe('POST /api/ninos/checkout', () => {
  it('calls ninos_checkout as the user and emails the parents', async () => {
    const filas = [{ nino_id: N1, salon_id: S1, salida_at: '2026-10-11T14:42:00Z' }]
    setup({ ninos_checkout: { data: filas }, ninos_correos_visita: { data: [fila] } })
    const res = await checkout(req('checkout', cuerpoCheckout))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ filas })
    expect(rpc).toHaveBeenCalledWith('ninos_checkout', { p_codigo: '4821', p_turno_id: T1, p_fecha: '2026-10-11', p_retirado_por: 'Ana' })
    expect(rpc).toHaveBeenCalledWith('ninos_correos_visita', { p_nino_ids: [N1], p_turno_id: T1, p_fecha: '2026-10-11', p_evento: 'retiro' })
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'ninos-retiro-v1-p1' }))
  })

  it('no rows released: no email lookup', async () => {
    setup({ ninos_checkout: { data: [] } })
    expect((await checkout(req('checkout', cuerpoCheckout))).status).toBe(200)
    expect(rpc).not.toHaveBeenCalledWith('ninos_correos_visita', expect.anything())
  })

  it('403 passes through', async () => {
    setup({ ninos_checkout: { error: { code: '42501', message: 'not allowed' } } })
    const res = await checkout(req('checkout', cuerpoCheckout))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: { code: '42501' } })
  })

  it('400 without who picks up or with a bad code', async () => {
    setup({})
    expect((await checkout(req('checkout', { ...cuerpoCheckout, retiradoPor: ' ' }))).status).toBe(400)
    expect((await checkout(req('checkout', { ...cuerpoCheckout, codigo: '12' }))).status).toBe(400)
  })
})
