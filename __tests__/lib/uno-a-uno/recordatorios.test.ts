/**
 * T5 / T5.2 (odd/tasks/uno-a-uno.md) — queueing and sending the 1:1 reminders:
 * encolar (S5.1) and one send run (S5.9, S5.11, S5.12): whole people are
 * claimed within the daily cap, each person gets ONE email listing all their
 * 1:1s, every email goes in ONE batch request with a key derived from its
 * rows, and each row is reported; one failure never stops the rest.
 */

import type { EmailDeLote, SendEmailBatchResult } from '@/lib/email/send-batch'
import { encolarRecordatorios, enviarRecordatorios } from '@/lib/uno-a-uno/recordatorios'

// The real sender talks to Resend; every test injects its own.
jest.mock('@/lib/email/send-batch', () => ({ sendEmailBatch: jest.fn() }))

type Rpc = jest.Mock<Promise<{ data: unknown; error: { message: string } | null }>, [string, Record<string, unknown>?]>

function fila(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    uno_a_uno_id: `o-${id}`,
    usuario_id: `u-${id}`,
    email: `${id}@example.com`,
    nombre: `Persona ${id}`,
    lado: 'dirigido',
    fecha_hora: '2026-10-16T19:30:00+00:00',
    lugar: null,
    con_quien: [{ nombre: 'Luis', apellido: 'Gómez' }],
    intentos: 1,
    ...over,
  }
}

function clienteFalso(filas: unknown[], errores: Partial<Record<string, string>> = {}) {
  const rpc: Rpc = jest.fn(async (nombre: string) => {
    if (errores[nombre]) return { data: null, error: { message: errores[nombre] as string } }
    if (nombre === 'uno_a_uno_recordatorios_reclamar') return { data: filas, error: null }
    if (nombre === 'uno_a_uno_recordatorios_encolar') return { data: 3, error: null }
    return { data: null, error: null }
  })
  return { rpc, client: { rpc } as never }
}

function resultados(rpc: Rpc) {
  return rpc.mock.calls.filter(([nombre]) => nombre === 'uno_a_uno_recordatorios_resultado').map(([, args]) => args)
}

describe('encolarRecordatorios', () => {
  it('queues with the given instant and returns how many rows were added (S5.1)', async () => {
    const { rpc, client } = clienteFalso([])
    const ahora = new Date('2026-10-15T11:00:00Z')

    await expect(encolarRecordatorios(client, ahora)).resolves.toEqual({ encolados: 3 })
    expect(rpc).toHaveBeenCalledWith('uno_a_uno_recordatorios_encolar', { p_ahora: '2026-10-15T11:00:00.000Z' })
  })

  it("leaves the instant to the database's now() when none is given", async () => {
    const { rpc, client } = clienteFalso([])

    await encolarRecordatorios(client)
    expect(rpc).toHaveBeenCalledWith('uno_a_uno_recordatorios_encolar', {})
  })

  it('throws when the RPC fails', async () => {
    const { client } = clienteFalso([], { uno_a_uno_recordatorios_encolar: 'boom' })

    await expect(encolarRecordatorios(client)).rejects.toThrow('boom')
  })
})

interface EmailEnviado {
  to: string
  subject: string
  template: { props: Record<string, unknown> }
}

type EnviarLote = jest.Mock<Promise<SendEmailBatchResult>, [EmailDeLote[], { idempotencyKey: string }]>

const TODO_OK = { success: true, errors: [] }

// `unknown` so a test can also hand back a malformed response.
function enviarLoteFalso(respuesta: unknown = TODO_OK): EnviarLote {
  return jest.fn(async (_emails: EmailDeLote[], _opciones: { idempotencyKey: string }) => respuesta as SendEmailBatchResult)
}

function emailsDe(enviarLote: EnviarLote): EmailEnviado[] {
  return enviarLote.mock.calls[0][0] as unknown as EmailEnviado[]
}

function claveDe(enviarLote: EnviarLote): string {
  return enviarLote.mock.calls[0][1].idempotencyKey
}

describe('enviarRecordatorios', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://connect.example/'
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL
  })

  it('claims up to 100 people within 60 a day by default, or the given numbers (S5.11)', async () => {
    const { rpc, client } = clienteFalso([])
    const enviarLote = enviarLoteFalso()

    await enviarRecordatorios(client, { enviarLote })
    await enviarRecordatorios(client, { enviarLote, personas: 10, topeDiario: 20 })

    expect(rpc).toHaveBeenNthCalledWith(1, 'uno_a_uno_recordatorios_reclamar', { p_personas: 100, p_tope_diario: 60 })
    expect(rpc).toHaveBeenNthCalledWith(2, 'uno_a_uno_recordatorios_reclamar', { p_personas: 10, p_tope_diario: 20 })
  })

  it('sends one email per person listing all their 1:1s (S5.8)', async () => {
    const { client } = clienteFalso([
      fila('a1', { email: 'ana@example.com', nombre: 'Ana', fecha_hora: '2026-10-16T13:00:00+00:00' }),
      fila('a2', {
        email: 'ana@example.com',
        nombre: 'Ana',
        lugar: 'Café Central',
        con_quien: [{ nombre: 'Pedro', apellido: null }],
      }),
    ])
    const enviarLote = enviarLoteFalso()

    await enviarRecordatorios(client, { enviarLote })

    expect(enviarLote).toHaveBeenCalledTimes(1)
    const emails = emailsDe(enviarLote)
    expect(emails).toHaveLength(1)
    expect(emails[0]).toEqual(
      expect.objectContaining({ to: 'ana@example.com', subject: 'Recordatorio: tus 1 a 1 de mañana' }),
    )
    expect(emails[0].template.props).toEqual({
      nombre: 'Ana',
      unoAUnos: [
        { conQuien: [{ nombre: 'Luis', apellido: 'Gómez' }], fechaHora: '2026-10-16T13:00:00+00:00', lugar: null },
        {
          conQuien: [{ nombre: 'Pedro', apellido: null }],
          fechaHora: '2026-10-16T19:30:00+00:00',
          lugar: 'Café Central',
        },
      ],
      urlMisUnoAUno: 'https://connect.example/mis-uno-a-uno',
    })
  })

  it('lists a 1:1 once when two rows of the same person point at it', async () => {
    const { rpc, client } = clienteFalso([
      fila('a1', { email: 'casa@example.com', uno_a_uno_id: 'o-1', usuario_id: 'u-1' }),
      fila('a2', { email: 'casa@example.com', uno_a_uno_id: 'o-1', usuario_id: 'u-2' }),
    ])
    const enviarLote = enviarLoteFalso()

    await expect(enviarRecordatorios(client, { enviarLote })).resolves.toEqual({
      reclamados: 2,
      personas: 1,
      enviados: 1,
      fallidos: 0,
    })
    expect(emailsDe(enviarLote)[0].subject).toBe('Recordatorio: tu 1 a 1 de mañana')
    expect(emailsDe(enviarLote)[0].template.props.unoAUnos).toHaveLength(1)
    expect(resultados(rpc)).toEqual([
      { p_id: 'a1', p_ok: true },
      { p_id: 'a2', p_ok: true },
    ])
  })

  it('sends every person in ONE batch request with the singular subject for one 1:1 (S5.9)', async () => {
    const { client } = clienteFalso([fila('a'), fila('b')])
    const enviarLote = enviarLoteFalso()

    await enviarRecordatorios(client, { enviarLote })

    expect(enviarLote).toHaveBeenCalledTimes(1)
    expect(emailsDe(enviarLote).map(({ to, subject }) => ({ to, subject }))).toEqual([
      { to: 'a@example.com', subject: 'Recordatorio: tu 1 a 1 de mañana' },
      { to: 'b@example.com', subject: 'Recordatorio: tu 1 a 1 de mañana' },
    ])
    expect(emailsDe(enviarLote)[0].template.props.nombre).toBe('Persona a')
  })

  it("uses the first row's name for the person", async () => {
    const { client } = clienteFalso([
      fila('a1', { email: 'casa@example.com', nombre: 'Ana' }),
      fila('a2', { email: 'casa@example.com', nombre: 'Luis' }),
    ])
    const enviarLote = enviarLoteFalso()

    await enviarRecordatorios(client, { enviarLote })

    expect(emailsDe(enviarLote)[0].template.props.nombre).toBe('Ana')
  })

  it('derives the idempotency key from the rows of the batch, whatever their order (S5.9)', async () => {
    async function clave(filas: unknown[]): Promise<string> {
      const enviarLote = enviarLoteFalso()
      await enviarRecordatorios(clienteFalso(filas).client, { enviarLote })
      return claveDe(enviarLote)
    }

    const ab = await clave([fila('a'), fila('b')])
    expect(ab).toMatch(/^uno-a-uno-recordatorios\/[0-9a-f]{64}$/)
    expect(ab.length).toBeLessThanOrEqual(256)
    expect(await clave([fila('a'), fila('b')])).toBe(ab)
    expect(await clave([fila('b'), fila('a')])).toBe(ab)
    expect(await clave([fila('a'), fila('c')])).not.toBe(ab)
    expect(await clave([fila('a')])).not.toBe(ab)
  })

  it('falls back to the production site when NEXT_PUBLIC_SITE_URL is not set', async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    const { client } = clienteFalso([fila('a')])
    const enviarLote = enviarLoteFalso()

    await enviarRecordatorios(client, { enviarLote })

    expect(emailsDe(enviarLote)[0].template.props.urlMisUnoAUno).toBe('https://connect.yosoyglobal.org/mis-uno-a-uno')
  })

  it('reports every row of a sent person as ok and returns the counts', async () => {
    const { rpc, client } = clienteFalso([
      fila('a1', { email: 'ana@example.com' }),
      fila('a2', { email: 'ana@example.com' }),
      fila('b'),
    ])

    const resultado = await enviarRecordatorios(client, { enviarLote: enviarLoteFalso() })

    expect(resultados(rpc)).toEqual([
      { p_id: 'a1', p_ok: true },
      { p_id: 'a2', p_ok: true },
      { p_id: 'b', p_ok: true },
    ])
    expect(resultado).toEqual({ reclamados: 3, personas: 2, enviados: 2, fallidos: 0 })
  })

  it('marks only the rows of the person whose email failed (S5.9)', async () => {
    const { rpc, client } = clienteFalso([
      fila('a'),
      fila('b1', { email: 'b@example.com' }),
      fila('b2', { email: 'b@example.com' }),
    ])
    const enviarLote = enviarLoteFalso({ success: true, errors: [{ index: 1, message: 'Invalid `to` field.' }] })

    const resultado = await enviarRecordatorios(client, { enviarLote })

    expect(resultados(rpc)).toEqual([
      { p_id: 'a', p_ok: true },
      { p_id: 'b1', p_ok: false, p_error: 'Invalid `to` field.' },
      { p_id: 'b2', p_ok: false, p_error: 'Invalid `to` field.' },
    ])
    expect(resultado).toEqual({ reclamados: 3, personas: 2, enviados: 1, fallidos: 1 })
  })

  it('marks every row failed when the whole request fails (S5.12)', async () => {
    const { rpc, client } = clienteFalso([fila('a'), fila('b')])
    const enviarLote = enviarLoteFalso({ success: false, error: 'Too many requests' })

    const resultado = await enviarRecordatorios(client, { enviarLote })

    expect(resultados(rpc)).toEqual([
      { p_id: 'a', p_ok: false, p_error: 'Too many requests' },
      { p_id: 'b', p_ok: false, p_error: 'Too many requests' },
    ])
    expect(resultado).toEqual({ reclamados: 2, personas: 2, enviados: 0, fallidos: 2 })
  })

  it('marks every row failed when sending throws (S5.12)', async () => {
    const { rpc, client } = clienteFalso([fila('a'), fila('b')])
    const enviarLote = enviarLoteFalso()
    enviarLote.mockRejectedValue(new Error('network down'))

    const resultado = await enviarRecordatorios(client, { enviarLote })

    expect(resultados(rpc)).toEqual([
      { p_id: 'a', p_ok: false, p_error: 'network down' },
      { p_id: 'b', p_ok: false, p_error: 'network down' },
    ])
    expect(resultado).toEqual({ reclamados: 2, personas: 2, enviados: 0, fallidos: 2 })
  })

  it('reports a failure without a message as unknown', async () => {
    const { rpc, client } = clienteFalso([fila('a')])

    await enviarRecordatorios(client, { enviarLote: enviarLoteFalso({ success: false }) })

    expect(resultados(rpc)).toEqual([{ p_id: 'a', p_ok: false, p_error: 'Error desconocido' }])
  })

  it('returns zero counts and sends nothing when nothing is due', async () => {
    const { client } = clienteFalso([])
    const enviarLote = enviarLoteFalso()

    await expect(enviarRecordatorios(client, { enviarLote })).resolves.toEqual({
      reclamados: 0,
      personas: 0,
      enviados: 0,
      fallidos: 0,
    })
    expect(enviarLote).not.toHaveBeenCalled()
  })

  it('throws when claiming fails and sends nothing', async () => {
    const { client } = clienteFalso([], { uno_a_uno_recordatorios_reclamar: 'boom' })
    const enviarLote = enviarLoteFalso()

    await expect(enviarRecordatorios(client, { enviarLote })).rejects.toThrow('boom')
    expect(enviarLote).not.toHaveBeenCalled()
  })

  it('keeps going when recording a result fails, logging the row id but never the address', async () => {
    const { rpc, client } = clienteFalso([fila('a'), fila('b')])
    rpc.mockImplementation(async (nombre: string, args?: Record<string, unknown>) => {
      if (nombre === 'uno_a_uno_recordatorios_reclamar') return { data: [fila('a'), fila('b')], error: null }
      if (args?.p_id === 'a') throw new Error('db down')
      return { data: null, error: args?.p_id === 'b' ? { message: 'db down' } : null }
    })
    const consola = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    const resultado = await enviarRecordatorios(client, { enviarLote: enviarLoteFalso() })

    expect(resultados(rpc)).toHaveLength(2)
    expect(resultado).toEqual({ reclamados: 2, personas: 2, enviados: 2, fallidos: 0 })
    expect(JSON.stringify(consola.mock.calls)).toContain('"id":"a"')
    expect(JSON.stringify(consola.mock.calls)).toContain('"id":"b"')
    expect(JSON.stringify(consola.mock.calls)).not.toContain('@example.com')
    consola.mockRestore()
  })
})
