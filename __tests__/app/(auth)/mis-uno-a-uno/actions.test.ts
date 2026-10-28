/**
 * @jest-environment node
 *
 * T4 (odd/tasks/uno-a-uno.md) — server actions for /mis-uno-a-uno. The gate
 * is an authenticated session only; who may act on a 1:1 is decided by the
 * uno_a_uno_* functions (42501 / 22023 / P0002), mapped here to Spanish.
 * T7 (S7.3): both register actions carry an optional celebración (≤ 500).
 */

import {
  agendarUnoAUno,
  cancelarUnoAUno,
  registrarSinAgenda,
  registrarUnoAUno,
  reprogramarUnoAUno,
} from '@/app/(auth)/mis-uno-a-uno/actions'

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const revalidatePathMock = jest.requireMock('next/cache').revalidatePath as jest.Mock

interface Setup {
  user?: { id: string } | null
  rpcResult?: { data: unknown; error: { message?: string; code?: string } | null }
}

function setup(opts: Setup = {}): { rpc: jest.Mock } {
  const rpc = jest.fn().mockResolvedValue(opts.rpcResult ?? { data: 'nuevo-id', error: null })
  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: opts.user === undefined ? { id: 'auth-1' } : opts.user },
        error: null,
      }),
    },
    rpc,
  })
  return { rpc }
}

beforeEach(() => {
  revalidatePathMock.mockReset()
})

const DIRIGIDO = '11111111-1111-4111-8111-111111111111'
const UNO = '22222222-2222-4222-8222-222222222222'

const agendarInput = { dirigidoId: DIRIGIDO, fecha: '2026-10-20', hora: '18:30', lugar: '  Café Centro ' }
const sinAgendaInput = {
  dirigidoId: DIRIGIDO,
  fecha: '2026-10-10',
  hora: '09:00',
  resumen: ' Hablamos de su familia. ',
  notaPrivada: '',
  lugar: '',
}

describe('session gate', () => {
  it.each([
    ['agendarUnoAUno', () => agendarUnoAUno(agendarInput)],
    ['registrarUnoAUno', () => registrarUnoAUno({ id: UNO, resumen: 'Bien' })],
    ['registrarSinAgenda', () => registrarSinAgenda(sinAgendaInput)],
    ['reprogramarUnoAUno', () => reprogramarUnoAUno({ id: UNO, fecha: '2026-10-21', hora: '10:00' })],
    ['cancelarUnoAUno', () => cancelarUnoAUno({ id: UNO })],
  ])('%s returns unauthorized without a session and never calls the RPC', async (_name, run) => {
    const { rpc } = setup({ user: null })
    const result = await run()
    expect(result).toEqual({ ok: false, error: 'unauthorized', message: 'Necesitas iniciar sesión.' })
    expect(rpc).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

describe('input validation', () => {
  it('rejects a dirigido id that is not a uuid', async () => {
    const { rpc } = setup()
    const result = await agendarUnoAUno({ ...agendarInput, dirigidoId: 'abc' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects an empty date or time', async () => {
    const { rpc } = setup()
    const result = await agendarUnoAUno({ ...agendarInput, fecha: '' })
    expect(result).toEqual({ ok: false, error: 'invalid-input', message: 'Elige la fecha y la hora.' })
    const result2 = await reprogramarUnoAUno({ id: UNO, fecha: '2026-10-21', hora: '' })
    expect(result2.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('requires a resumen to register', async () => {
    const { rpc } = setup()
    expect(await registrarUnoAUno({ id: UNO, resumen: '   ' })).toEqual({
      ok: false,
      error: 'invalid-input',
      message: 'El resumen es obligatorio.',
    })
    const result = await registrarSinAgenda({ ...sinAgendaInput, resumen: '' })
    expect(result.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects a 1:1 id that is not a uuid', async () => {
    const { rpc } = setup()
    const result = await cancelarUnoAUno({ id: 'nope' })
    expect(result.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['registrarUnoAUno', () => registrarUnoAUno({ id: UNO, resumen: 'Bien', celebracion: 'x'.repeat(501) })],
    ['registrarSinAgenda', () => registrarSinAgenda({ ...sinAgendaInput, celebracion: 'x'.repeat(501) })],
  ])('%s rejects a celebración over 500 characters', async (_name, run) => {
    const { rpc } = setup()
    expect(await run()).toEqual({
      ok: false,
      error: 'invalid-input',
      message: 'La celebración admite hasta 500 caracteres.',
    })
    expect(rpc).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('accepts a celebración of exactly 500 characters', async () => {
    const { rpc } = setup({ rpcResult: { data: null, error: null } })
    expect(await registrarUnoAUno({ id: UNO, resumen: 'Bien', celebracion: 'x'.repeat(500) })).toEqual({ ok: true })
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_celebracion: 'x'.repeat(500) })
  })

  it('rejects text over the length limit', async () => {
    const { rpc } = setup()
    const result = await cancelarUnoAUno({ id: UNO, motivo: 'x'.repeat(301) })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('happy path', () => {
  it('agendarUnoAUno sends the Caracas timestamp and the trimmed lugar', async () => {
    const { rpc } = setup()
    expect(await agendarUnoAUno(agendarInput)).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('uno_a_uno_agendar', {
      p_dirigido_id: DIRIGIDO,
      p_fecha_hora: '2026-10-20T18:30:00-04:00',
      p_lugar: 'Café Centro',
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/mis-uno-a-uno')
  })

  it('agendarUnoAUno leaves a blank lugar out (the function defaults it to NULL)', async () => {
    const { rpc } = setup()
    await agendarUnoAUno({ ...agendarInput, lugar: '  ' })
    expect(JSON.stringify(rpc.mock.calls[0][1])).not.toContain('p_lugar')
  })

  it('registrarUnoAUno sends the resumen and the private note', async () => {
    const { rpc } = setup({ rpcResult: { data: null, error: null } })
    expect(await registrarUnoAUno({ id: UNO, resumen: ' Bien ', notaPrivada: ' Orar por su trabajo ' })).toEqual({
      ok: true,
    })
    expect(rpc).toHaveBeenCalledWith('uno_a_uno_registrar', {
      p_id: UNO,
      p_resumen: 'Bien',
      p_nota_privada: 'Orar por su trabajo',
      p_celebracion: undefined,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/mis-uno-a-uno')
  })

  it('registrarUnoAUno sends the trimmed celebración', async () => {
    const { rpc } = setup({ rpcResult: { data: null, error: null } })
    expect(await registrarUnoAUno({ id: UNO, resumen: 'Bien', celebracion: ' Se bautizó ' })).toEqual({ ok: true })
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_celebracion: 'Se bautizó' })
  })

  it('registrarSinAgenda sends the trimmed celebración', async () => {
    const { rpc } = setup()
    expect(await registrarSinAgenda({ ...sinAgendaInput, celebracion: ' Consiguió trabajo ' })).toEqual({ ok: true })
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_celebracion: 'Consiguió trabajo' })
  })

  it('registrarSinAgenda sends every field and leaves blanks out', async () => {
    const { rpc } = setup()
    expect(await registrarSinAgenda(sinAgendaInput)).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('uno_a_uno_registrar_sin_agenda', {
      p_dirigido_id: DIRIGIDO,
      p_fecha_hora: '2026-10-10T09:00:00-04:00',
      p_resumen: 'Hablamos de su familia.',
      p_nota_privada: undefined,
      p_lugar: undefined,
      p_celebracion: undefined,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/mis-uno-a-uno')
  })

  it('reprogramarUnoAUno sends the new Caracas timestamp', async () => {
    const { rpc } = setup({ rpcResult: { data: null, error: null } })
    expect(await reprogramarUnoAUno({ id: UNO, fecha: '2026-10-21', hora: '10:00' })).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('uno_a_uno_reprogramar', {
      p_id: UNO,
      p_fecha_hora: '2026-10-21T10:00:00-04:00',
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/mis-uno-a-uno')
  })

  it('cancelarUnoAUno sends the motivo, or null when blank', async () => {
    const { rpc } = setup({ rpcResult: { data: null, error: null } })
    expect(await cancelarUnoAUno({ id: UNO, motivo: ' Viaje ' })).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('uno_a_uno_cancelar', { p_id: UNO, p_motivo: 'Viaje' })
    await cancelarUnoAUno({ id: UNO })
    expect(rpc).toHaveBeenLastCalledWith('uno_a_uno_cancelar', { p_id: UNO, p_motivo: undefined })
    expect(revalidatePathMock).toHaveBeenCalledWith('/mis-uno-a-uno')
  })
})

describe('database errors', () => {
  it('maps "No lideras a esta persona." (42501) to forbidden with that message', async () => {
    setup({ rpcResult: { data: null, error: { code: '42501', message: 'No lideras a esta persona.' } } })
    const result = await agendarUnoAUno(agendarInput)
    expect(result).toEqual({ ok: false, error: 'forbidden', message: 'No lideras a esta persona.' })
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('maps the leader-side check (42501) to forbidden', async () => {
    setup({
      rpcResult: { data: null, error: { code: '42501', message: 'Solo quien lidera este 1 a 1 puede cambiarlo.' } },
    })
    const result = await cancelarUnoAUno({ id: UNO })
    expect(result).toEqual({ ok: false, error: 'forbidden', message: 'Solo quien lidera este 1 a 1 puede cambiarlo.' })
  })

  it('maps a session error from the database (42501) to unauthorized', async () => {
    setup({ rpcResult: { data: null, error: { code: '42501', message: 'Debes iniciar sesión.' } } })
    const result = await reprogramarUnoAUno({ id: UNO, fecha: '2026-10-21', hora: '10:00' })
    expect(result).toEqual({ ok: false, error: 'unauthorized', message: 'Necesitas iniciar sesión.' })
  })

  it('never leaks an unknown 42501 message', async () => {
    setup({ rpcResult: { data: null, error: { code: '42501', message: 'permission denied for table uno_a_uno' } } })
    const result = await cancelarUnoAUno({ id: UNO })
    expect(result).toEqual({ ok: false, error: 'forbidden', message: 'No tienes permiso para hacer esto.' })
  })

  it('maps a past date (22023) to invalid-input with the database message', async () => {
    setup({ rpcResult: { data: null, error: { code: '22023', message: 'La fecha del 1 a 1 debe ser futura.' } } })
    const result = await agendarUnoAUno(agendarInput)
    expect(result).toEqual({ ok: false, error: 'invalid-input', message: 'La fecha del 1 a 1 debe ser futura.' })
  })

  it('maps a wrong state (22023) to invalid-input', async () => {
    setup({ rpcResult: { data: null, error: { code: '22023', message: 'Este 1 a 1 ya no está agendado.' } } })
    const result = await registrarUnoAUno({ id: UNO, resumen: 'Bien' })
    expect(result).toEqual({ ok: false, error: 'invalid-input', message: 'Este 1 a 1 ya no está agendado.' })
  })

  it('maps the database celebración limit (22023) to invalid-input with its message', async () => {
    setup({
      rpcResult: { data: null, error: { code: '22023', message: 'La celebración no puede superar 500 caracteres.' } },
    })
    const result = await registrarSinAgenda(sinAgendaInput)
    expect(result).toEqual({
      ok: false,
      error: 'invalid-input',
      message: 'La celebración no puede superar 500 caracteres.',
    })
  })

  it('maps not found (P0002) to not-found', async () => {
    setup({ rpcResult: { data: null, error: { code: 'P0002', message: 'No encontramos este 1 a 1.' } } })
    const result = await reprogramarUnoAUno({ id: UNO, fecha: '2026-10-21', hora: '10:00' })
    expect(result).toEqual({ ok: false, error: 'not-found', message: 'No encontramos este 1 a 1.' })
  })

  it('falls back to a generic message for anything else', async () => {
    setup({ rpcResult: { data: null, error: { code: '08006', message: 'connection failure' } } })
    const result = await registrarSinAgenda(sinAgendaInput)
    expect(result).toEqual({ ok: false, error: 'unknown', message: 'No se pudo registrar el 1 a 1.' })
  })
})
