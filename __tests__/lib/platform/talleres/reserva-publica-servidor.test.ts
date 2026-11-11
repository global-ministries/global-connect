/**
 * @jest-environment node
 *
 * Server handlers of the public reservation (T5b, S3 S4 S11 S12 S13): the code
 * is generated and hashed here, emailed to the address on file, and the
 * browser never receives that address nor the salted hashes.
 */
import { createHash } from 'node:crypto'

import {
  avisameLugar,
  crearReserva,
  generarCodigo,
  hashCodigo,
  hashTokenReserva,
  identificarReserva,
  reenviarCodigoReserva,
  verificarCodigoReserva,
  type DependenciasReserva,
} from '@/lib/platform/talleres/reserva-publica-servidor'

const EDICION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTRA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CODIGO_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const INVITACION = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const TOKEN = 'T'.repeat(43)
const IP = '203.0.113.9'

const taller = {
  slug: 'mujer-de-hoy',
  nombre: 'Mujer de Hoy',
  tipo: 'individual',
  ediciones: [{ id: EDICION, fecha_inicio: '2026-11-19' }],
}

type Respuesta = { data: unknown; error: { code?: string; message?: string } | null }

function preparar(respuestas: Record<string, Respuesta>) {
  const rpc = jest.fn(async (nombre: string) => respuestas[nombre] ?? { data: null, error: null })
  const enviarCorreo = jest.fn(async () => ({ success: true }))
  const enviarInvitacion = jest.fn(async () => 'enviada')
  const despacharAvisos = jest.fn(async () => undefined)
  const deps: DependenciasReserva = {
    rpc,
    sal: 'sal-de-prueba',
    enviarCorreo,
    enviarInvitacion,
    despacharAvisos,
    codigo: () => '042917',
    token: () => TOKEN,
  }
  return { deps, rpc, enviarCorreo, enviarInvitacion, despacharAvisos }
}

const llamada = (rpc: jest.Mock, nombre: string) => rpc.mock.calls.find((c) => c[0] === nombre)?.[1] as Record<string, unknown> | undefined

let errorLog: jest.SpyInstance
beforeEach(() => {
  errorLog = jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => errorLog.mockRestore())

describe('code and hashes', () => {
  it('generates six digits, zero-padded', () => {
    for (let i = 0; i < 200; i++) expect(generarCodigo()).toMatch(/^\d{6}$/)
  })

  it('hashes the code with the salt (sha256 hex) so the same code differs per salt', () => {
    expect(hashCodigo('123456', 'a')).toBe(createHash('sha256').update('a:123456').digest('hex'))
    expect(hashCodigo('123456', 'a')).not.toBe(hashCodigo('123456', 'b'))
    expect(hashCodigo('123456', 'a')).not.toBe(hashCodigo('123457', 'a'))
  })

  it('hashes the reservation token with plain sha256 hex', () => {
    expect(hashTokenReserva(TOKEN)).toBe(createHash('sha256').update(TOKEN).digest('hex'))
  })
})

describe('identificarReserva', () => {
  const cuerpo = { edicionId: EDICION, slug: 'mujer-de-hoy', cedula: '15598745', sitio_web: '' }

  it('honeypot: answers like a new person and touches nothing', async () => {
    const { deps, rpc, enviarCorreo } = preparar({})
    const r = await identificarReserva(deps, { ...cuerpo, sitio_web: 'http://spam' }, IP)
    expect(r).toEqual({ status: 200, body: { estado: 'nuevo' } })
    expect(rpc).not.toHaveBeenCalled()
    expect(enviarCorreo).not.toHaveBeenCalled()
  })

  it('emails the code to the address on file and returns only the masked email', async () => {
    const { deps, rpc, enviarCorreo } = preparar({
      talleres_publico_taller: { data: taller, error: null },
      talleres_reserva_identificar: {
        data: { estado: 'codigo', codigo_id: CODIGO_ID, email_mascara: 'v***@g***.com', envio: { email: 'valentina@gmail.com', nombre: 'Valentina' } },
        error: null,
      },
    })
    const r = await identificarReserva(deps, cuerpo, IP)

    expect(r).toEqual({ status: 200, body: { estado: 'codigo', codigoId: CODIGO_ID, emailMascara: 'v***@g***.com' } })
    expect(JSON.stringify(r.body)).not.toContain('valentina@gmail.com')
    const args = llamada(rpc, 'talleres_reserva_identificar')
    expect(args).toMatchObject({ p_edicion_id: EDICION, p_cedula: '15598745', p_codigo_hash: hashCodigo('042917', 'sal-de-prueba') })
    expect(args?.p_ip_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(args?.p_aviso_texto).toBe('Tu código para reservar en Mujer de Hoy: 042917. Vence en 10 minutos.')
    expect(enviarCorreo).toHaveBeenCalledTimes(1)
    expect(enviarCorreo.mock.calls[0]).toEqual([
      expect.objectContaining({ to: 'valentina@gmail.com', subject: 'Tu código para reservar en Mujer de Hoy' }),
    ])
  })

  it('keeps the code out of the subject (send.ts logs subjects): only the body carries it', async () => {
    const { deps, enviarCorreo } = preparar({
      talleres_publico_taller: { data: taller, error: null },
      talleres_reserva_identificar: {
        data: { estado: 'codigo', codigo_id: CODIGO_ID, email_mascara: 'v***@g***.com', envio: { email: 'valentina@gmail.com', nombre: 'Valentina' } },
        error: null,
      },
    })
    await identificarReserva(deps, cuerpo, IP)
    const correo = (enviarCorreo.mock.calls as unknown as [{ subject: string; template: { props: { codigo: string } } }][])[0][0]
    expect(correo.subject).not.toMatch(/\d{6}/)
    expect(correo.subject).not.toContain('042917')
    expect(correo.template.props.codigo).toBe('042917')
  })

  it.each(['nuevo', 'sin_correo'])('passes %s through without sending email', async (estado) => {
    const { deps, enviarCorreo } = preparar({
      talleres_publico_taller: { data: taller, error: null },
      talleres_reserva_identificar: { data: { estado }, error: null },
    })
    expect(await identificarReserva(deps, cuerpo, IP)).toEqual({ status: 200, body: { estado } })
    expect(enviarCorreo).not.toHaveBeenCalled()
  })

  it('an edición outside the slug reads as closed without identifying', async () => {
    const { deps, rpc } = preparar({ talleres_publico_taller: { data: taller, error: null } })
    const r = await identificarReserva(deps, { ...cuerpo, edicionId: OTRA }, IP)
    expect(r.status).toBe(409)
    expect(r.body.estado).toBe('cerrada')
    expect(llamada(rpc, 'talleres_reserva_identificar')).toBeUndefined()
  })

  it('maps a malformed cédula to 400 and the rate limit to 429', async () => {
    const invalido = preparar({
      talleres_publico_taller: { data: taller, error: null },
      talleres_reserva_identificar: { data: { estado: 'invalido', campo: 'cedula' }, error: null },
    })
    const r = await identificarReserva(invalido.deps, cuerpo, IP)
    expect(r.status).toBe(400)
    expect(r.body).toMatchObject({ estado: 'invalido', campo: 'cedula' })

    const limite = preparar({
      talleres_publico_taller: { data: taller, error: null },
      talleres_reserva_identificar: { data: { estado: 'limite' }, error: null },
    })
    expect((await identificarReserva(limite.deps, cuerpo, IP)).status).toBe(429)
  })

  it('500 on a database error, logging the code only', async () => {
    const { deps } = preparar({
      talleres_publico_taller: { data: taller, error: null },
      talleres_reserva_identificar: { data: null, error: { code: '22023', message: 'datos_invalidos 15598745' } },
    })
    const r = await identificarReserva(deps, cuerpo, IP)
    expect(r.status).toBe(500)
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('15598745')
    expect(JSON.stringify(errorLog.mock.calls)).toContain('22023')
  })

  it('400 for a body that is not a request', async () => {
    const { deps, rpc } = preparar({})
    expect((await identificarReserva(deps, { cedula: 1 }, IP)).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('verificarCodigoReserva', () => {
  const cuerpo = { codigoId: CODIGO_ID, codigo: '042917' }

  it('ok: stores only the token hash and returns the raw token and first name', async () => {
    const { deps, rpc } = preparar({ talleres_reserva_codigo_verificar: { data: { estado: 'ok', nombre: 'Valentina' }, error: null } })
    const r = await verificarCodigoReserva(deps, cuerpo, IP)
    expect(r).toEqual({ status: 200, body: { estado: 'ok', nombre: 'Valentina', token: TOKEN } })
    expect(llamada(rpc, 'talleres_reserva_codigo_verificar')).toMatchObject({
      p_codigo_id: CODIGO_ID,
      p_codigo_hash: hashCodigo('042917', 'sal-de-prueba'),
      p_token_hash: hashTokenReserva(TOKEN),
    })
  })

  it.each([
    [{ estado: 'invalido', intentos_restantes: 4 }, 400, { estado: 'invalido', intentosRestantes: 4, mensaje: 'Ese código no coincide. Te quedan 4 intentos.' }],
    [{ estado: 'vencido' }, 409, { estado: 'vencido' }],
    [{ estado: 'bloqueado' }, 409, { estado: 'bloqueado' }],
    [{ estado: 'limite' }, 429, { estado: 'limite' }],
  ])('maps %p to %i', async (data, status, body) => {
    const { deps } = preparar({ talleres_reserva_codigo_verificar: { data, error: null } })
    const r = await verificarCodigoReserva(deps, cuerpo, IP)
    expect(r.status).toBe(status)
    expect(r.body).toMatchObject(body)
    expect(r.body).not.toHaveProperty('token')
  })

  it('400 without calling the database for a code that is not six digits', async () => {
    const { deps, rpc } = preparar({})
    expect((await verificarCodigoReserva(deps, { codigoId: CODIGO_ID, codigo: '12a456' }, IP)).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('reenviarCodigoReserva', () => {
  it('emails a new code and stores its hash', async () => {
    const { deps, rpc, enviarCorreo } = preparar({
      talleres_publico_taller: { data: taller, error: null },
      talleres_reserva_codigo_reenviar: {
        data: { estado: 'codigo', codigo_id: CODIGO_ID, email_mascara: 'v***@g***.com', envio: { email: 'v@gmail.com', nombre: 'V' } },
        error: null,
      },
    })
    const r = await reenviarCodigoReserva(deps, { codigoId: CODIGO_ID, slug: 'mujer-de-hoy' }, IP)
    expect(r).toEqual({ status: 200, body: { estado: 'codigo', codigoId: CODIGO_ID, emailMascara: 'v***@g***.com' } })
    expect(llamada(rpc, 'talleres_reserva_codigo_reenviar')).toMatchObject({ p_codigo_hash_nuevo: hashCodigo('042917', 'sal-de-prueba') })
    expect(enviarCorreo).toHaveBeenCalledWith(expect.objectContaining({ to: 'v@gmail.com', subject: 'Tu código para reservar en Mujer de Hoy' }))
    const correo = (enviarCorreo.mock.calls as unknown as [{ subject: string }][])[0][0]
    expect(correo.subject).not.toMatch(/\d{6}/)
  })

  it('a resend too soon answers 429 with the seconds to wait', async () => {
    const { deps, enviarCorreo } = preparar({
      talleres_publico_taller: { data: taller, error: null },
      talleres_reserva_codigo_reenviar: { data: { estado: 'espera', segundos: 42 }, error: null },
    })
    const r = await reenviarCodigoReserva(deps, { codigoId: CODIGO_ID, slug: 'mujer-de-hoy' }, IP)
    expect(r.status).toBe(429)
    expect(r.body).toMatchObject({ estado: 'espera', segundos: 42 })
    expect(enviarCorreo).not.toHaveBeenCalled()
  })
})

describe('crearReserva', () => {
  const ficha = {
    cedula: '27441903',
    nombre: 'Daniela',
    apellido: 'Mujica',
    fecha_nacimiento: '1995-04-02',
    telefono: '04141234567',
    email: 'daniela@example.com',
    genero: 'Femenino',
  }

  it('sends the raw token as its hash and does not invite an existing person', async () => {
    const { deps, rpc, enviarInvitacion } = preparar({
      talleres_reserva_crear: { data: { estado: 'ok', inscripcion_id: 'x', invitacion_id: null, por_verificar: false }, error: null },
    })
    const r = await crearReserva(deps, { edicionId: EDICION, principal: { token: TOKEN } }, IP)
    expect(r).toEqual({ status: 200, body: { estado: 'ok', porVerificar: false, cuentaNueva: false } })
    expect(llamada(rpc, 'talleres_reserva_crear')).toMatchObject({ p_edicion_id: EDICION, p_datos: { token: hashTokenReserva(TOKEN) } })
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(TOKEN)
    expect(enviarInvitacion).not.toHaveBeenCalled()
  })

  it('a new person gets the activation invitation (S4)', async () => {
    const { deps, rpc, enviarInvitacion } = preparar({
      talleres_reserva_crear: { data: { estado: 'ok', inscripcion_id: 'x', invitacion_id: INVITACION, por_verificar: false }, error: null },
    })
    const r = await crearReserva(deps, { edicionId: EDICION, principal: { ficha_nueva: ficha } }, IP)
    expect(r.body).toEqual({ estado: 'ok', porVerificar: false, cuentaNueva: true })
    expect(llamada(rpc, 'talleres_reserva_crear')?.p_datos).toEqual({ ficha_nueva: ficha })
    expect(enviarInvitacion).toHaveBeenCalledWith(INVITACION)
  })

  it('builds the pareja part: spouse token hashed, pendiente cédula, vínculo', async () => {
    const { deps, rpc } = preparar({
      talleres_reserva_crear: { data: { estado: 'ok', inscripcion_id: 'x', invitacion_id: null, por_verificar: true }, error: null },
    })
    const otro = 'U'.repeat(43)
    await crearReserva(deps, { edicionId: EDICION, principal: { token: TOKEN }, pareja: { token: otro }, vinculo: 'novios' }, IP)
    expect(llamada(rpc, 'talleres_reserva_crear')?.p_datos).toEqual({
      token: hashTokenReserva(TOKEN),
      pareja: { token: hashTokenReserva(otro) },
      vinculo: 'novios',
    })
    rpc.mockClear()
    const r = await crearReserva(deps, { edicionId: EDICION, principal: { por_verificar: { cedula: '15598745' } }, pareja: { pendiente_cedula: '12345678' } }, IP)
    expect(llamada(rpc, 'talleres_reserva_crear')?.p_datos).toEqual({ por_verificar: { cedula: '15598745' }, pareja: { pendiente_cedula: '12345678' } })
    expect(r.body).toMatchObject({ porVerificar: true })
  })

  it('honeypot: fake ok without writing', async () => {
    const { deps, rpc, enviarInvitacion, despacharAvisos } = preparar({})
    const r = await crearReserva(deps, { edicionId: EDICION, principal: { ficha_nueva: ficha }, sitio_web: 'x' }, IP)
    expect(r).toEqual({ status: 200, body: { estado: 'ok', porVerificar: false, cuentaNueva: true } })
    expect(rpc).not.toHaveBeenCalled()
    expect(enviarInvitacion).not.toHaveBeenCalled()
    expect(despacharAvisos).not.toHaveBeenCalled()
  })

  // T9 (S6, L22) — the «Inscripción recibida» notice is written with the
  // inscription; its email goes out right away, not at the daily cron.
  it('sends the due notices once after a created reservation', async () => {
    const { deps, despacharAvisos } = preparar({
      talleres_reserva_crear: { data: { estado: 'ok', inscripcion_id: 'x', invitacion_id: null, por_verificar: false }, error: null },
    })
    await crearReserva(deps, { edicionId: EDICION, principal: { token: TOKEN } }, IP)
    expect(despacharAvisos).toHaveBeenCalledTimes(1)
  })

  it('does not send notices when the database refuses or fails', async () => {
    const rechazo = preparar({ talleres_reserva_crear: { data: { estado: 'cupo_lleno' }, error: null } })
    await crearReserva(rechazo.deps, { edicionId: EDICION, principal: { token: TOKEN } }, IP)
    expect(rechazo.despacharAvisos).not.toHaveBeenCalled()
    const caida = preparar({ talleres_reserva_crear: { data: null, error: { code: 'XX000', message: 'x' } } })
    await crearReserva(caida.deps, { edicionId: EDICION, principal: { token: TOKEN } }, IP)
    expect(caida.despacharAvisos).not.toHaveBeenCalled()
  })

  it.each([
    [{ estado: 'cupo_lleno' }, 409],
    [{ estado: 'ya_inscrito' }, 409],
    [{ estado: 'cerrada' }, 409],
    [{ estado: 'genero_no_aplica' }, 409],
    [{ estado: 'pareja_no_disponible' }, 409],
    [{ estado: 'invalido', campo: 'pareja.email' }, 400],
    [{ estado: 'invalido' }, 400],
    [{ estado: 'limite' }, 429],
  ])('maps %p to %i with a message and no invitation', async (data, status) => {
    const { deps, enviarInvitacion } = preparar({ talleres_reserva_crear: { data, error: null } })
    const r = await crearReserva(deps, { edicionId: EDICION, principal: { ficha_nueva: ficha } }, IP)
    expect(r.status).toBe(status)
    expect(r.body.estado).toBe(data.estado)
    expect(typeof r.body.mensaje).toBe('string')
    expect(enviarInvitacion).not.toHaveBeenCalled()
  })

  it('the campo of an invalid answer reaches the browser', async () => {
    const { deps } = preparar({ talleres_reserva_crear: { data: { estado: 'invalido', campo: 'pareja.email' }, error: null } })
    expect((await crearReserva(deps, { edicionId: EDICION, principal: { ficha_nueva: ficha } }, IP)).body).toMatchObject({ campo: 'pareja.email' })
  })
})

describe('avisameLugar', () => {
  const cuerpo = { edicionId: EDICION, nombre: 'Ana', email: 'ana@example.com', sitio_web: '' }

  it('adds the person to the notice list', async () => {
    const { deps, rpc } = preparar({ talleres_avisame_lugar_agregar: { data: { estado: 'ok' }, error: null } })
    expect(await avisameLugar(deps, cuerpo, IP)).toEqual({ status: 200, body: { estado: 'ok' } })
    expect(llamada(rpc, 'talleres_avisame_lugar_agregar')).toMatchObject({ p_edicion_id: EDICION, p_nombre: 'Ana', p_email: 'ana@example.com' })
  })

  it('honeypot: ok without writing; invalid email: 400 with the field', async () => {
    const h = preparar({})
    expect(await avisameLugar(h.deps, { ...cuerpo, sitio_web: 'x' }, IP)).toEqual({ status: 200, body: { estado: 'ok' } })
    expect(h.rpc).not.toHaveBeenCalled()

    const i = preparar({ talleres_avisame_lugar_agregar: { data: { estado: 'invalido', campo: 'email' }, error: null } })
    const r = await avisameLugar(i.deps, cuerpo, IP)
    expect(r.status).toBe(400)
    expect(r.body).toMatchObject({ estado: 'invalido', campo: 'email' })
  })
})
