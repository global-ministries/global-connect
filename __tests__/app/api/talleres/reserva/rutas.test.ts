/**
 * @jest-environment node
 *
 * POST /api/talleres/reserva/* (T5b): public, no session, service-role RPCs.
 * Shared rules: body size cap, bad JSON, rate limit, server errors without
 * personal data in the logs, and the address on file never in a response.
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/email/send', () => ({ sendEmail: jest.fn() }))
jest.mock('@/lib/platform/talleres/invitacion-acceso-envio', () => ({ enviarInvitacionAcceso: jest.fn() }))

import { POST as avisame } from '@/app/api/talleres/reserva/avisame/route'
import { POST as reenviar } from '@/app/api/talleres/reserva/codigo/reenviar/route'
import { POST as verificar } from '@/app/api/talleres/reserva/codigo/verificar/route'
import { POST as crear } from '@/app/api/talleres/reserva/crear/route'
import { POST as identificar } from '@/app/api/talleres/reserva/identificar/route'

const createAdmin = jest.requireMock('@/lib/supabase/admin').createSupabaseAdminClient as jest.Mock
const sendEmail = jest.requireMock('@/lib/email/send').sendEmail as jest.Mock
const enviarInvitacion = jest.requireMock('@/lib/platform/talleres/invitacion-acceso-envio').enviarInvitacionAcceso as jest.Mock

const EDICION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CODIGO_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const taller = { slug: 'mujer-de-hoy', nombre: 'Mujer de Hoy', tipo: 'individual', ediciones: [{ id: EDICION, fecha_inicio: '2026-11-19' }] }

let rpc: jest.Mock
let errorLog: jest.SpyInstance

const pedir = (ruta: string, body: string, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost/api/talleres/reserva/${ruta}`, { method: 'POST', body, headers })

const identificarValido = JSON.stringify({ edicionId: EDICION, slug: 'mujer-de-hoy', cedula: '15598745', sitio_web: '' })

beforeEach(() => {
  rpc = jest.fn(async (nombre: string) => {
    if (nombre === 'talleres_publico_taller') return { data: taller, error: null }
    return { data: { estado: 'ok' }, error: null }
  })
  createAdmin.mockReturnValue({ rpc })
  sendEmail.mockResolvedValue({ success: true })
  enviarInvitacion.mockResolvedValue('enviada')
  errorLog = jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => errorLog.mockRestore())

describe('POST /api/talleres/reserva/*', () => {
  it.each([
    ['identificar', identificar],
    ['codigo/verificar', verificar],
    ['codigo/reenviar', reenviar],
    ['crear', crear],
    ['avisame', avisame],
  ])('%s: 413 for an oversized body and 400 for bad JSON, before the database', async (ruta, POST) => {
    expect((await POST(pedir(ruta, JSON.stringify({ relleno: 'x'.repeat(20_000) })))).status).toBe(413)
    expect((await POST(pedir(ruta, '{nope'))).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('identificar never sends the address on file to the browser', async () => {
    rpc.mockImplementation(async (nombre: string) =>
      nombre === 'talleres_publico_taller'
        ? { data: taller, error: null }
        : {
            data: { estado: 'codigo', codigo_id: CODIGO_ID, email_mascara: 'v***@g***.com', envio: { email: 'valentina@gmail.com', nombre: 'Valentina' } },
            error: null,
          },
    )
    const res = await identificar(pedir('identificar', identificarValido, { 'x-real-ip': '198.51.100.7' }))
    expect(res.status).toBe(200)
    const texto = await res.text()
    expect(texto).not.toContain('valentina@gmail.com')
    expect(texto).not.toContain('envio')
    expect(JSON.parse(texto)).toEqual({ estado: 'codigo', codigoId: CODIGO_ID, emailMascara: 'v***@g***.com' })
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'valentina@gmail.com' }))
  })

  it('honeypot: identificar answers without calling the database', async () => {
    const res = await identificar(pedir('identificar', JSON.stringify({ edicionId: EDICION, slug: 'mujer-de-hoy', cedula: '1', sitio_web: 'spam' })))
    expect(res.status).toBe(200)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('429 when the database says limite', async () => {
    rpc.mockImplementation(async (nombre: string) =>
      nombre === 'talleres_publico_taller' ? { data: taller, error: null } : { data: { estado: 'limite' }, error: null },
    )
    expect((await identificar(pedir('identificar', identificarValido))).status).toBe(429)
  })

  it('500 when the client throws, logging no personal data', async () => {
    createAdmin.mockImplementation(() => {
      throw new Error('falló con 15598745')
    })
    const res = await identificar(pedir('identificar', identificarValido))
    expect(res.status).toBe(500)
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('15598745')
  })

  it('crear sends the activation invitation only when the database created one', async () => {
    const ficha = {
      cedula: '27441903',
      nombre: 'Daniela',
      apellido: 'Mujica',
      fecha_nacimiento: '1995-04-02',
      telefono: '04141234567',
      email: 'daniela@example.com',
      genero: 'Femenino',
    }
    rpc.mockResolvedValueOnce({ data: { estado: 'ok', inscripcion_id: 'i', invitacion_id: 'inv-9', por_verificar: false }, error: null })
    const res = await crear(pedir('crear', JSON.stringify({ edicionId: EDICION, principal: { ficha_nueva: ficha } })))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ estado: 'ok', porVerificar: false, cuentaNueva: true })
    expect(enviarInvitacion).toHaveBeenCalledWith('inv-9')

    enviarInvitacion.mockClear()
    rpc.mockResolvedValueOnce({ data: { estado: 'ok', inscripcion_id: 'i', invitacion_id: null, por_verificar: true }, error: null })
    await crear(pedir('crear', JSON.stringify({ edicionId: EDICION, principal: { por_verificar: { cedula: '15598745' } } })))
    expect(enviarInvitacion).not.toHaveBeenCalled()
  })

  it('avisame stores the request', async () => {
    const res = await avisame(pedir('avisame', JSON.stringify({ edicionId: EDICION, nombre: 'Ana', email: 'ana@example.com' })))
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('talleres_avisame_lugar_agregar', expect.objectContaining({ p_edicion_id: EDICION }))
  })
})
