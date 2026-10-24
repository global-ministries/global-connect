/**
 * T5 (odd/tasks/uno-a-uno.md) — queueing and draining the 1:1 reminders:
 * encolar (S5.1) and one drain batch (S5.3): a claimed batch is sent one by
 * one with a pause between sends, an idempotency key per row, and each result
 * reported; one failure never stops the batch.
 */

import { encolarRecordatorios, enviarRecordatorios } from '@/lib/uno-a-uno/recordatorios'

// The real sender talks to Resend; every test injects its own.
jest.mock('@/lib/email/send', () => ({ sendEmail: jest.fn() }))

type Rpc = jest.Mock<Promise<{ data: unknown; error: { message: string } | null }>, [string, Record<string, unknown>?]>

function fila(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    uno_a_uno_id: `o-${id}`,
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

describe('enviarRecordatorios', () => {
  const OK = { success: true, id: 'resend-id' }

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://connect.example/'
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL
  })

  it('claims one batch of the given size (25 by default)', async () => {
    const { rpc, client } = clienteFalso([])
    const deps = { enviar: jest.fn(), esperar: jest.fn() }

    await enviarRecordatorios(client, deps)
    await enviarRecordatorios(client, { ...deps, limite: 10 })

    expect(rpc).toHaveBeenNthCalledWith(1, 'uno_a_uno_recordatorios_reclamar', { p_limite: 25 })
    expect(rpc).toHaveBeenNthCalledWith(2, 'uno_a_uno_recordatorios_reclamar', { p_limite: 10 })
  })

  it('sends in order with a pause between sends and none after the last (S5.3)', async () => {
    const { client } = clienteFalso([fila('a'), fila('b'), fila('c')])
    const orden: string[] = []
    const enviar = jest.fn(async ({ to }: { to: string | string[] }) => {
      orden.push(`enviar ${to}`)
      return OK
    })
    const esperar = jest.fn(async (ms: number) => {
      orden.push(`esperar ${ms}`)
    })

    await enviarRecordatorios(client, { enviar, esperar })

    expect(orden).toEqual([
      'enviar a@example.com',
      'esperar 600',
      'enviar b@example.com',
      'esperar 600',
      'enviar c@example.com',
    ])
  })

  it('uses the given pause', async () => {
    const { client } = clienteFalso([fila('a'), fila('b')])
    const esperar = jest.fn(async () => undefined)

    await enviarRecordatorios(client, { enviar: jest.fn(async () => OK), esperar, pausaMs: 1000 })

    expect(esperar).toHaveBeenCalledTimes(1)
    expect(esperar).toHaveBeenCalledWith(1000)
  })

  it('sends each email with the subject, the template and an idempotency key per row', async () => {
    const { client } = clienteFalso([fila('a'), fila('b')])
    const enviar = jest.fn(async () => OK)

    await enviarRecordatorios(client, { enviar, esperar: jest.fn() })

    expect(enviar).toHaveBeenCalledTimes(2)
    expect(enviar.mock.calls[0]).toEqual([
      expect.objectContaining({
        to: 'a@example.com',
        subject: 'Recordatorio: tu 1 a 1 de mañana',
        idempotencyKey: 'uno-a-uno-recordatorio/a',
      }),
    ])
    expect(enviar.mock.calls[1]).toEqual([expect.objectContaining({ idempotencyKey: 'uno-a-uno-recordatorio/b' })])
  })

  it('builds the template from the row and the site URL', async () => {
    const { client } = clienteFalso([fila('a', { lugar: 'Café Central' })])
    const enviar = jest.fn(async () => OK)

    await enviarRecordatorios(client, { enviar, esperar: jest.fn() })

    const [{ template }] = enviar.mock.calls[0] as unknown as [{ template: { props: Record<string, unknown> } }]
    expect(template.props).toEqual({
      nombre: 'Persona a',
      conQuien: [{ nombre: 'Luis', apellido: 'Gómez' }],
      fechaHora: '2026-10-16T19:30:00+00:00',
      lugar: 'Café Central',
      urlMisUnoAUno: 'https://connect.example/mis-uno-a-uno',
    })
  })

  it('falls back to the production site when NEXT_PUBLIC_SITE_URL is not set', async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    const { client } = clienteFalso([fila('a')])
    const enviar = jest.fn(async () => OK)

    await enviarRecordatorios(client, { enviar, esperar: jest.fn() })

    const [{ template }] = enviar.mock.calls[0] as unknown as [{ template: { props: Record<string, unknown> } }]
    expect(template.props.urlMisUnoAUno).toBe('https://connect.yosoyglobal.org/mis-uno-a-uno')
  })

  it('reports each row: ok, failed with the error, and a thrown error does not stop the batch', async () => {
    const { rpc, client } = clienteFalso([fila('a'), fila('b'), fila('c')])
    const enviar = jest
      .fn()
      .mockResolvedValueOnce(OK)
      .mockResolvedValueOnce({ success: false, error: 'rate limited' })
      .mockRejectedValueOnce(new Error('network down'))

    const resultado = await enviarRecordatorios(client, { enviar, esperar: jest.fn() })

    expect(enviar).toHaveBeenCalledTimes(3)
    expect(resultados(rpc)).toEqual([
      { p_id: 'a', p_ok: true },
      { p_id: 'b', p_ok: false, p_error: 'rate limited' },
      { p_id: 'c', p_ok: false, p_error: 'network down' },
    ])
    expect(resultado).toEqual({ reclamados: 3, enviados: 1, fallidos: 2 })
  })

  it('reports a failure without a message as unknown', async () => {
    const { rpc, client } = clienteFalso([fila('a')])

    await enviarRecordatorios(client, { enviar: jest.fn(async () => ({ success: false })), esperar: jest.fn() })

    expect(resultados(rpc)).toEqual([{ p_id: 'a', p_ok: false, p_error: 'Error desconocido' }])
  })

  it('returns zero counts and sends nothing when the queue is empty', async () => {
    const { client } = clienteFalso([])
    const enviar = jest.fn()
    const esperar = jest.fn()

    await expect(enviarRecordatorios(client, { enviar, esperar })).resolves.toEqual({
      reclamados: 0,
      enviados: 0,
      fallidos: 0,
    })
    expect(enviar).not.toHaveBeenCalled()
    expect(esperar).not.toHaveBeenCalled()
  })

  it('throws when claiming fails', async () => {
    const { client } = clienteFalso([], { uno_a_uno_recordatorios_reclamar: 'boom' })

    await expect(enviarRecordatorios(client, { enviar: jest.fn(), esperar: jest.fn() })).rejects.toThrow('boom')
  })

  it('keeps going when recording a result fails, without logging the address', async () => {
    const { client } = clienteFalso([fila('a'), fila('b')], { uno_a_uno_recordatorios_resultado: 'db down' })
    const enviar = jest.fn(async () => OK)
    const consola = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    const resultado = await enviarRecordatorios(client, { enviar, esperar: jest.fn() })

    expect(enviar).toHaveBeenCalledTimes(2)
    expect(resultado).toEqual({ reclamados: 2, enviados: 2, fallidos: 0 })
    expect(JSON.stringify(consola.mock.calls)).not.toContain('@example.com')
    consola.mockRestore()
  })
})
