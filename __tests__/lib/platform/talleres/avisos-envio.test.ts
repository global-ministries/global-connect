/**
 * @jest-environment node
 *
 * T7 (odd/tasks/talleres-reserva-publica.md, S6 S13) — the email outbox of
 * the talleres notices: lease → one email per row with the idempotency key
 * `talleres-aviso/<row id>` → record each result; one failure never stops
 * the rest; the immediate dispatch never throws.
 */
import { isValidElement } from 'react'

import {
  claveIdempotencia,
  correoDe,
  despacharAvisosTalleres,
  enviarAvisosPendientes,
  parseEnvios,
  urlAbsoluta,
  type ClienteAdminAvisos,
  type CorreoAviso,
} from '@/lib/platform/talleres/avisos-envio'

jest.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: jest.fn(),
}))

const BASE = 'https://connect.example'

function fila(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    clave: `inscripcion_aprobada:${id}`,
    tipo: 'inscripcion_aprobada',
    email: `${id}@example.test`,
    nombre: 'Ana',
    asunto: 'Aprobamos tu inscripción en Mujer de Hoy',
    datos: {
      titulo: 'Aprobamos tu inscripción',
      cuerpo: 'Tienes tu lugar en Mujer de Hoy.',
      url: '/talleres/mi-recorrido',
      cta: 'Ver mi taller',
      taller: 'Mujer de Hoy',
      filas: [['Taller', 'Mujer de Hoy · Octubre']],
    },
    intentos: 1,
    ...extra,
  }
}

function cliente(filas: unknown[], { errorReclamo }: { errorReclamo?: string } = {}) {
  const rpc = jest.fn((nombre: string) => {
    if (nombre === 'talleres_avisos_envios_reclamar') {
      return Promise.resolve(errorReclamo ? { data: null, error: { message: errorReclamo } } : { data: filas, error: null })
    }
    return Promise.resolve({ data: null, error: null })
  })
  return { client: { rpc } as unknown as ClienteAdminAvisos, rpc }
}

describe('parseEnvios', () => {
  it('reads the email data the database wrote and drops rows without id or email', () => {
    const envios = parseEnvios([fila('a'), { ...fila('b'), email: null }, { email: 'x@example.test' }, 'basura'])

    expect(envios).toEqual([
      {
        id: 'a',
        email: 'a@example.test',
        nombre: 'Ana',
        asunto: 'Aprobamos tu inscripción en Mujer de Hoy',
        titulo: 'Aprobamos tu inscripción',
        cuerpo: 'Tienes tu lugar en Mujer de Hoy.',
        url: '/talleres/mi-recorrido',
        cta: 'Ver mi taller',
        taller: 'Mujer de Hoy',
        filas: [['Taller', 'Mujer de Hoy · Octubre']],
      },
    ])
  })

  it('is empty for anything that is not a list', () => {
    expect(parseEnvios(null)).toEqual([])
    expect(parseEnvios({})).toEqual([])
  })
})

describe('urlAbsoluta', () => {
  it('prefixes in-app paths and drops anything else', () => {
    expect(urlAbsoluta('/talleres/reservar/mujer-de-hoy', `${BASE}/`)).toBe(`${BASE}/talleres/reservar/mujer-de-hoy`)
    expect(urlAbsoluta('https://evil.example', BASE)).toBeNull()
    expect(urlAbsoluta('//evil.example', BASE)).toBeNull()
    expect(urlAbsoluta(null, BASE)).toBeNull()
  })
})

describe('correoDe', () => {
  it('keys each email by its outbox row', () => {
    const [envio] = parseEnvios([fila('fila-1')])
    const correo = correoDe(envio, BASE)

    expect(correo.idempotencyKey).toBe('talleres-aviso/fila-1')
    expect(claveIdempotencia('fila-1')).toBe('talleres-aviso/fila-1')
    expect(correo.to).toBe('fila-1@example.test')
    expect(correo.subject).toBe('Aprobamos tu inscripción en Mujer de Hoy')
    expect(isValidElement(correo.template)).toBe(true)
    expect((correo.template.props as { url: string }).url).toBe(`${BASE}/talleres/mi-recorrido`)
  })
})

describe('enviarAvisosPendientes', () => {
  it('leases within the limit and the daily cap, sends one email per row with its own key and records each', async () => {
    const { client, rpc } = cliente([fila('f1'), fila('f2')])
    const enviados: CorreoAviso[] = []
    const enviarCorreo = jest.fn(async (correo: CorreoAviso) => {
      enviados.push(correo)
      return { success: true }
    })

    const resultado = await enviarAvisosPendientes(client, { limite: 20, topeDiario: 30, enviarCorreo, urlBase: BASE })

    expect(resultado).toEqual({ reclamados: 2, enviados: 2, fallidos: 0 })
    expect(rpc).toHaveBeenNthCalledWith(1, 'talleres_avisos_envios_reclamar', { p_limite: 20, p_tope_diario: 30 })
    expect(enviados.map((c) => c.idempotencyKey)).toEqual(['talleres-aviso/f1', 'talleres-aviso/f2'])
    expect(rpc).toHaveBeenCalledWith('talleres_avisos_envios_resultado', { p_id: 'f1', p_ok: true })
    expect(rpc).toHaveBeenCalledWith('talleres_avisos_envios_resultado', { p_id: 'f2', p_ok: true })
  })

  it('the same row always gets the same key, so a retried row never reaches anyone twice', async () => {
    const claves: string[] = []
    const enviarCorreo = async (correo: CorreoAviso) => {
      claves.push(correo.idempotencyKey)
      return { success: true }
    }
    await enviarAvisosPendientes(cliente([fila('f9')]).client, { enviarCorreo, urlBase: BASE })
    await enviarAvisosPendientes(cliente([fila('f9', { intentos: 2 })]).client, { enviarCorreo, urlBase: BASE })

    expect(claves).toEqual(['talleres-aviso/f9', 'talleres-aviso/f9'])
  })

  it('one failure (error or throw) is recorded and the rest still go', async () => {
    const { client, rpc } = cliente([fila('f1'), fila('f2'), fila('f3')])
    const enviarCorreo = jest
      .fn()
      .mockResolvedValueOnce({ success: false, error: 'Resend 500' })
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ success: true })

    const resultado = await enviarAvisosPendientes(client, { enviarCorreo, urlBase: BASE })

    expect(resultado).toEqual({ reclamados: 3, enviados: 1, fallidos: 2 })
    expect(rpc).toHaveBeenCalledWith('talleres_avisos_envios_resultado', { p_id: 'f1', p_ok: false, p_error: 'Resend 500' })
    expect(rpc).toHaveBeenCalledWith('talleres_avisos_envios_resultado', { p_id: 'f2', p_ok: false, p_error: 'timeout' })
    expect(rpc).toHaveBeenCalledWith('talleres_avisos_envios_resultado', { p_id: 'f3', p_ok: true })
  })

  it('throws when the lease fails, sending nothing', async () => {
    const enviarCorreo = jest.fn()
    await expect(
      enviarAvisosPendientes(cliente([], { errorReclamo: 'permission denied' }).client, { enviarCorreo }),
    ).rejects.toThrow('No se pudieron tomar los avisos: permission denied')
    expect(enviarCorreo).not.toHaveBeenCalled()
  })

  it('uses TALLERES_AVISOS_TOPE_DIARIO, else 40', async () => {
    const enviarCorreo = jest.fn()
    const primero = cliente([])
    await enviarAvisosPendientes(primero.client, { enviarCorreo })
    expect(primero.rpc).toHaveBeenCalledWith('talleres_avisos_envios_reclamar', { p_limite: 50, p_tope_diario: 40 })

    process.env.TALLERES_AVISOS_TOPE_DIARIO = '80'
    const segundo = cliente([])
    await enviarAvisosPendientes(segundo.client, { enviarCorreo })
    expect(segundo.rpc).toHaveBeenCalledWith('talleres_avisos_envios_reclamar', { p_limite: 50, p_tope_diario: 80 })
    delete process.env.TALLERES_AVISOS_TOPE_DIARIO
  })
})

describe('despacharAvisosTalleres', () => {
  it('never throws, even without an admin client', async () => {
    const admin = jest.requireMock('@/lib/supabase/admin').createSupabaseAdminClient as jest.Mock
    admin.mockImplementation(() => {
      throw new Error('Faltan variables')
    })
    const consola = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(despacharAvisosTalleres()).resolves.toBeUndefined()
    expect(consola).toHaveBeenCalledWith('[talleres-avisos] Despacho inmediato falló', { error: 'Faltan variables' })
    consola.mockRestore()
  })

  it('sends up to 10 due rows with the admin client', async () => {
    const { client, rpc } = cliente([])
    const admin = jest.requireMock('@/lib/supabase/admin').createSupabaseAdminClient as jest.Mock
    admin.mockReturnValue(client)

    await despacharAvisosTalleres({ enviarCorreo: jest.fn(), topeDiario: 40 })

    expect(rpc).toHaveBeenCalledWith('talleres_avisos_envios_reclamar', { p_limite: 10, p_tope_diario: 40 })
  })
})
