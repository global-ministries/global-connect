/** @jest-environment node */
/**
 * Probes from the independent verification of the public reservation (T5b,
 * S1 S3 S4 S11 S13): code and token shapes, exact response keys, the
 * invitation only for a new person, honeypots, 429 on limits, the client IP
 * and the public paths of the middleware.
 */
jest.mock('@supabase/ssr', () => ({ createServerClient: jest.fn() }))
jest.mock('@sentry/nextjs', () => ({ addBreadcrumb: jest.fn() }))
jest.mock('next/server', () => ({ NextResponse: { next: jest.fn(), redirect: jest.fn() } }))

import { ipDeSolicitud } from '@/lib/platform/ninos/preregistro-servidor'
import {
  avisameLugar,
  crearReserva,
  generarCodigo,
  generarTokenReserva,
  identificarReserva,
  reenviarCodigoReserva,
  verificarCodigoReserva,
  type DependenciasReserva,
} from '@/lib/platform/talleres/reserva-publica-servidor'
import { isPublicPath } from '@/middleware'

const EDICION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTRA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CODIGO_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const INVITACION = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const TOKEN = 'T'.repeat(43)
const IP = '203.0.113.9'

const taller = { slug: 'mujer-de-hoy', nombre: 'Mujer de Hoy', tipo: 'individual', ediciones: [{ id: EDICION, fecha_inicio: '2026-11-19' }] }

const ficha = {
  cedula: '27441903',
  nombre: 'Daniela',
  apellido: 'Mujica',
  fecha_nacimiento: '1995-04-02',
  telefono: '04141234567',
  email: 'daniela@example.com',
  genero: 'Femenino',
}

type Respuesta = { data: unknown; error: { code?: string; message?: string } | null }

function preparar(respuestas: Record<string, Respuesta>) {
  const rpc = jest.fn(async (nombre: string) => respuestas[nombre] ?? { data: null, error: null })
  const enviarCorreo = jest.fn(async () => ({ success: true }))
  const enviarInvitacion = jest.fn(async () => 'enviada')
  const deps: DependenciasReserva = { rpc, sal: 'sal', enviarCorreo, enviarInvitacion, codigo: () => '042917', token: () => TOKEN }
  return { deps, rpc, enviarInvitacion }
}

const claves = (body: Record<string, unknown>) => Object.keys(body).sort()

let errorLog: jest.SpyInstance
beforeEach(() => {
  errorLog = jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => errorLog.mockRestore())

describe('code and token shapes', () => {
  it('the code is always six digits (5000 samples)', () => {
    for (let i = 0; i < 5000; i++) expect(generarCodigo()).toMatch(/^\d{6}$/)
  })

  it('the token is 32 bytes in base64url', () => {
    expect(generarTokenReserva()).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })
})

it('an edición outside the slug is cerrada/409 after reading only talleres_publico_taller', async () => {
  const { deps, rpc } = preparar({ talleres_publico_taller: { data: taller, error: null } })
  const r = await identificarReserva(deps, { edicionId: OTRA, slug: 'mujer-de-hoy', cedula: '15598745', sitio_web: '' }, IP)
  expect(r.status).toBe(409)
  expect(r.body.estado).toBe('cerrada')
  expect(rpc.mock.calls.map((c) => c[0])).toEqual(['talleres_publico_taller'])
})

describe('exact response keys', () => {
  it('reenviar: codigoId, emailMascara, estado', async () => {
    const { deps } = preparar({
      talleres_publico_taller: { data: taller, error: null },
      talleres_reserva_codigo_reenviar: {
        data: { estado: 'codigo', codigo_id: CODIGO_ID, email_mascara: 'v***@g***.com', envio: { email: 'v@gmail.com', nombre: 'V' } },
        error: null,
      },
    })
    const r = await reenviarCodigoReserva(deps, { codigoId: CODIGO_ID, slug: 'mujer-de-hoy' }, IP)
    expect(claves(r.body)).toEqual(['codigoId', 'emailMascara', 'estado'])
  })

  it('verificar: estado, nombre, token', async () => {
    const { deps } = preparar({ talleres_reserva_codigo_verificar: { data: { estado: 'ok', nombre: 'Valentina', email: 'x@y.com' }, error: null } })
    const r = await verificarCodigoReserva(deps, { codigoId: CODIGO_ID, codigo: '042917' }, IP)
    expect(claves(r.body)).toEqual(['estado', 'nombre', 'token'])
  })

  it('crear: cuentaNueva, estado, porVerificar', async () => {
    const { deps } = preparar({
      talleres_reserva_crear: { data: { estado: 'ok', inscripcion_id: 'x', invitacion_id: INVITACION, por_verificar: false, persona_id: 'p' }, error: null },
    })
    const r = await crearReserva(deps, { edicionId: EDICION, principal: { ficha_nueva: ficha } }, IP)
    expect(claves(r.body)).toEqual(['cuentaNueva', 'estado', 'porVerificar'])
  })
})

describe('the access invitation', () => {
  it('is not sent when invitacion_id is null', async () => {
    const { deps, enviarInvitacion } = preparar({
      talleres_reserva_crear: { data: { estado: 'ok', inscripcion_id: 'x', invitacion_id: null, por_verificar: false }, error: null },
    })
    await crearReserva(deps, { edicionId: EDICION, principal: { token: TOKEN } }, IP)
    expect(enviarInvitacion).not.toHaveBeenCalled()
  })

  it('is sent with the invitation id', async () => {
    const { deps, enviarInvitacion } = preparar({
      talleres_reserva_crear: { data: { estado: 'ok', inscripcion_id: 'x', invitacion_id: INVITACION, por_verificar: false }, error: null },
    })
    await crearReserva(deps, { edicionId: EDICION, principal: { ficha_nueva: ficha } }, IP)
    expect(enviarInvitacion).toHaveBeenCalledTimes(1)
    expect(enviarInvitacion).toHaveBeenCalledWith(INVITACION)
  })
})

describe('honeypot makes no RPC', () => {
  it('crear', async () => {
    const { deps, rpc } = preparar({})
    await crearReserva(deps, { edicionId: EDICION, principal: { ficha_nueva: ficha }, sitio_web: 'http://spam' }, IP)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('avisame', async () => {
    const { deps, rpc } = preparar({})
    await avisameLugar(deps, { edicionId: EDICION, nombre: 'Ana', email: 'ana@example.com', sitio_web: 'http://spam' }, IP)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('estado limite answers 429', () => {
  it('identificar', async () => {
    const { deps } = preparar({
      talleres_publico_taller: { data: taller, error: null },
      talleres_reserva_identificar: { data: { estado: 'limite' }, error: null },
    })
    expect((await identificarReserva(deps, { edicionId: EDICION, slug: 'mujer-de-hoy', cedula: '15598745', sitio_web: '' }, IP)).status).toBe(429)
  })

  it('crear', async () => {
    const { deps } = preparar({ talleres_reserva_crear: { data: { estado: 'limite' }, error: null } })
    expect((await crearReserva(deps, { edicionId: EDICION, principal: { ficha_nueva: ficha } }, IP)).status).toBe(429)
  })

  it('avisame', async () => {
    const { deps } = preparar({ talleres_avisame_lugar_agregar: { data: { estado: 'limite' }, error: null } })
    expect((await avisameLugar(deps, { edicionId: EDICION, nombre: 'Ana', email: 'ana@example.com', sitio_web: '' }, IP)).status).toBe(429)
  })
})

describe('ipDeSolicitud', () => {
  it('x-real-ip first', () => {
    expect(ipDeSolicitud(new Headers({ 'x-real-ip': '198.51.100.1', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('198.51.100.1')
  })

  it('then the last x-forwarded-for entry', () => {
    expect(ipDeSolicitud(new Headers({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('2.2.2.2')
  })
})

describe('isPublicPath', () => {
  it.each(['/talleres/reservar', '/talleres/reservar/mujer-de-hoy'])('%s is public', (ruta) => {
    expect(isPublicPath(ruta)).toBe(true)
  })

  it.each(['/talleres', '/talleres/explorar', '/talleres/reservar/a/b', '/talleres/reservarx', '/talleres/reservar/', '/talleres/abc/reservar'])(
    '%s is not public',
    (ruta) => {
      expect(isPublicPath(ruta)).toBe(false)
    },
  )
})
