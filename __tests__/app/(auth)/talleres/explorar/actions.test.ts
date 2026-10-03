/**
 * @jest-environment node
 *
 * Explorar server actions (app/(auth)/talleres/explorar/actions.ts).
 *
 * Inscripción en pareja (odd/tasks/talleres-inscripcion-en-pareja.md P2) —
 * members no longer insert into taller_inscripciones directly (the member
 * branch of its INSERT policy is gone). `inscribirseATaller` goes through
 * rpc('talleres_inscribirme', {p_edicion_id, p_pareja}): the RPC resolves
 * the caller from auth.uid(), the cohorte from the edición and the partner
 * from p_pareja, so the action never looks up `usuarios` nor sends a
 * cohorte. Every returned or raised code reaches the browser as a neutral
 * Spanish message, never as raw RAISE text.
 *
 * Mocks `@/lib/platform/talleres/api-helpers` (the gate) and
 * `@/lib/platform/talleres/flags`. The supabase client is exposed via the
 * gate's return value with only `rpc` (and a `from` that must never run).
 */

import {
  buscarParejaPorCedula,
  inscribirseATaller,
  miConyugeRegistrado,
} from '@/app/(auth)/talleres/explorar/actions'

jest.mock('@/lib/platform/talleres/flags', () => ({
  isTalleresEnabled: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/api-helpers', () => ({
  requireTalleresApiAuthenticated: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

const isTalleresEnabledMock = jest.requireMock('@/lib/platform/talleres/flags')
  .isTalleresEnabled as jest.Mock
const requireTalleresApiAuthenticatedMock = jest.requireMock(
  '@/lib/platform/talleres/api-helpers',
).requireTalleresApiAuthenticated as jest.Mock
const revalidatePathMock = jest.requireMock('next/cache')
  .revalidatePath as jest.Mock

const AUTH_UID = 'auth-uid-1'
const TALLER_ID = 'taller-edicion-1'

beforeEach(() => {
  isTalleresEnabledMock.mockReset().mockReturnValue(true)
  requireTalleresApiAuthenticatedMock.mockReset()
  revalidatePathMock.mockReset()
})

// ─── inscribirseATaller through talleres_inscribirme ─────────────────────

const NO_CONFIRMADA =
  'No pudimos confirmar a tu pareja con esos datos. Revisa la cédula o pide ayuda a la coordinación del taller.'

function gateConRpc(rpc: jest.Mock) {
  const from = jest.fn(() => {
    throw new Error('inscribirseATaller must never touch a table directly')
  })
  requireTalleresApiAuthenticatedMock.mockResolvedValue({ ok: true, supabase: { rpc, from }, userId: AUTH_UID })
  return from
}

function rpcConResultado(data: unknown, error: unknown = null) {
  return jest.fn().mockResolvedValue({ data, error })
}

const OK = { ok: true, inscripcion_id: 'inscripcion-1', estado: 'pendiente', pareja_origen: null }

describe('inscribirseATaller — calls the RPC', () => {
  it('enrolls an individual edición with p_pareja null and revalidates the participant views', async () => {
    const rpc = rpcConResultado(OK)
    const from = gateConRpc(rpc)

    const result = await inscribirseATaller({ edicionId: TALLER_ID, pareja: null })

    expect(result).toEqual({ ok: true, inscripcionId: 'inscripcion-1' })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('talleres_inscribirme', { p_edicion_id: TALLER_ID, p_pareja: null })
    // No usuarios lookup, no direct insert, no client-side cohorte.
    expect(from).not.toHaveBeenCalled()
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/explorar')
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/mi-recorrido')
  })

  it('treats a missing pareja as an individual enrollment', async () => {
    const rpc = rpcConResultado(OK)
    gateConRpc(rpc)
    await inscribirseATaller({ edicionId: TALLER_ID })
    expect(rpc).toHaveBeenCalledWith('talleres_inscribirme', { p_edicion_id: TALLER_ID, p_pareja: null })
  })

  it('sends the registered-spouse mode', async () => {
    const rpc = rpcConResultado({ ...OK, pareja_origen: 'conyuge_registrado' })
    gateConRpc(rpc)

    await inscribirseATaller({ edicionId: TALLER_ID, pareja: { modo: 'conyuge_registrado' } })

    expect(rpc).toHaveBeenCalledWith('talleres_inscribirme', {
      p_edicion_id: TALLER_ID,
      p_pareja: { modo: 'conyuge_registrado' },
    })
  })

  it('sends the cédula mode normalized, with the chosen vínculo and the dismissed spouse', async () => {
    const rpc = rpcConResultado({ ...OK, pareja_origen: 'cedula' })
    gateConRpc(rpc)

    await inscribirseATaller({
      edicionId: TALLER_ID,
      pareja: { modo: 'cedula', cedula: 'V-12.345.678', vinculo: 'novios', conyugeDescartado: true },
    })

    expect(rpc).toHaveBeenCalledWith('talleres_inscribirme', {
      p_edicion_id: TALLER_ID,
      p_pareja: { modo: 'cedula', cedula: '12345678', vinculo: 'novios', conyuge_descartado: true },
    })
  })
})

describe('inscribirseATaller — returned codes', () => {
  it.each([
    ['EDICION_NOT_FOUND', /ya no está disponible/i],
    ['EDICION_NO_ABIERTA', /inscripciones.*cerradas/i],
    ['YA_INSCRITO', /ya tienes una inscripción/i],
    ['CUPO_LLENO', /cupos/i],
    ['PAREJA_NO_CONFIRMADA', NO_CONFIRMADA],
    ['PAREJA_NO_DISPONIBLE', /coordinación/i],
    ['LIMITE_ALCANZADO', /^Hiciste demasiadas búsquedas hoy\. Prueba mañana o pide ayuda a la coordinación\.$/],
  ])('maps %s to its own message and does not revalidate', async (codigo, mensaje) => {
    gateConRpc(rpcConResultado({ ok: false, codigo }))

    const result = await inscribirseATaller({ edicionId: TALLER_ID, pareja: null })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected ok:false')
    expect(result.error).toBe(codigo)
    expect(result.message).toMatch(mensaje)
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

describe('inscribirseATaller — raised codes', () => {
  it.each([
    ['42501', 'SIN_FICHA'],
    ['22023', 'VINCULO_REQUERIDO'],
    ['22023', 'MODO_NO_APLICA'],
    ['22023', 'COMPANERO_REQUERIDO'],
    ['22023', 'COMPANERO_NO_APLICA'],
    ['22023', 'MODO_INVALIDO'],
    ['22023', 'CEDULA_INVALIDA'],
    ['P0001', 'PERSONA_YA_EN_EDICION'],
  ])('maps a raised %s %s to its own code and a Spanish message', async (sqlstate, codigo) => {
    gateConRpc(rpcConResultado(null, { code: sqlstate, message: codigo }))

    const result = await inscribirseATaller({ edicionId: TALLER_ID, pareja: null })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected ok:false')
    expect(result.error).toBe(codigo)
    expect(result.message).not.toContain(codigo)
    expect(result.message.length).toBeGreaterThan(0)
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('maps a bare 42501 to forbidden and anything unknown to internal, never leaking the raw text', async () => {
    gateConRpc(rpcConResultado(null, { code: '42501', message: 'permission denied for function talleres_inscribirme' }))
    const denegado = await inscribirseATaller({ edicionId: TALLER_ID, pareja: null })
    expect(denegado).toEqual({ ok: false, error: 'forbidden', message: expect.any(String) })

    gateConRpc(rpcConResultado(null, { code: 'XX000', message: 'boom at line 42' }))
    const roto = await inscribirseATaller({ edicionId: TALLER_ID, pareja: null })
    expect(roto.ok).toBe(false)
    if (roto.ok) throw new Error('expected ok:false')
    expect(roto.error).toBe('internal')
    expect(roto.message).not.toContain('boom')
  })

  it('treats an off-contract answer as internal', async () => {
    gateConRpc(rpcConResultado({ ok: true }))
    const result = await inscribirseATaller({ edicionId: TALLER_ID, pareja: null })
    expect(result).toEqual({ ok: false, error: 'internal', message: expect.any(String) })
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

describe('inscribirseATaller — input and gate', () => {
  it('rejects a missing edición id before the gate', async () => {
    const result = await inscribirseATaller({ edicionId: '' })
    expect(result).toEqual({ ok: false, error: 'invalid-input', message: expect.any(String) })
    expect(requireTalleresApiAuthenticatedMock).not.toHaveBeenCalled()
  })

  it('rejects an unrecognizable cédula without calling the RPC', async () => {
    const rpc = jest.fn()
    gateConRpc(rpc)
    const result = await inscribirseATaller({ edicionId: TALLER_ID, pareja: { modo: 'cedula', cedula: 'abc' } })
    expect(result).toEqual({ ok: false, error: 'CEDULA_INVALIDA', message: expect.any(String) })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects an unknown pareja mode as invalid-input', async () => {
    const rpc = jest.fn()
    gateConRpc(rpc)
    const result = await inscribirseATaller({
      edicionId: TALLER_ID,
      pareja: { modo: 'ficha_nueva' } as unknown as { modo: 'conyuge_registrado' },
    })
    expect(result).toEqual({ ok: false, error: 'invalid-input', message: expect.any(String) })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns not-found when talleres are disabled', async () => {
    isTalleresEnabledMock.mockReturnValue(false)
    const result = await inscribirseATaller({ edicionId: TALLER_ID })
    expect(result).toEqual({ ok: false, error: 'not-found', message: expect.any(String) })
    expect(requireTalleresApiAuthenticatedMock).not.toHaveBeenCalled()
  })

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [500, 'internal'],
  ])('maps a %s gate to %s', async (status, error) => {
    requireTalleresApiAuthenticatedMock.mockResolvedValue({ ok: false, response: { status } })
    expect(await inscribirseATaller({ edicionId: TALLER_ID })).toEqual({
      ok: false,
      error,
      message: expect.any(String),
    })
  })
})

// ─── Inscripción en pareja (odd/tasks/talleres-inscripcion-en-pareja.md P2) ─
// The two read-side partner lookups the picker uses before enrolling.

describe('miConyugeRegistrado', () => {
  it('calls talleres_mi_conyuge_registrado with no arguments and parses the single row', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ nombre: 'Ana', apellido: 'García', foto_perfil_url: 'https://x/ana.jpg' }],
      error: null,
    })
    gateConRpc(rpc)

    const result = await miConyugeRegistrado()

    expect(rpc).toHaveBeenCalledWith('talleres_mi_conyuge_registrado')
    expect(result).toEqual({
      ok: true,
      conyuge: { nombre: 'Ana', apellido: 'García', fotoUrl: 'https://x/ana.jpg' },
    })
  })

  it('returns conyuge null when the RPC returns no row', async () => {
    gateConRpc(jest.fn().mockResolvedValue({ data: [], error: null }))
    expect(await miConyugeRegistrado()).toEqual({ ok: true, conyuge: null })
  })

  it('returns internal with a neutral message when the RPC fails', async () => {
    gateConRpc(jest.fn().mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom' } }))
    const result = await miConyugeRegistrado()
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected ok:false')
    expect(result.error).toBe('internal')
    expect(result.message).not.toContain('boom')
  })

  it('returns not-found when talleres are disabled, without touching the gate', async () => {
    isTalleresEnabledMock.mockReturnValue(false)
    const result = await miConyugeRegistrado()
    expect(result).toEqual({ ok: false, error: 'not-found', message: expect.any(String) })
    expect(requireTalleresApiAuthenticatedMock).not.toHaveBeenCalled()
  })

  it('maps a 401 gate to unauthorized', async () => {
    requireTalleresApiAuthenticatedMock.mockResolvedValue({ ok: false, response: { status: 401 } })
    expect(await miConyugeRegistrado()).toEqual({ ok: false, error: 'unauthorized', message: expect.any(String) })
  })
})

describe('buscarParejaPorCedula', () => {
  it('sends the edición and the normalized cédula, and returns the masked name', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { ok: true, encontrada: true, nombre_mostrado: 'María G.' },
      error: null,
    })
    gateConRpc(rpc)

    const result = await buscarParejaPorCedula(TALLER_ID, ' V-12.345.678 ')

    expect(rpc).toHaveBeenCalledWith('talleres_buscar_pareja_por_cedula', {
      p_edicion_id: TALLER_ID,
      p_cedula: '12345678',
    })
    expect(result).toEqual({ ok: true, encontrada: true, nombreMostrado: 'María G.' })
  })

  it('answers a not-found cédula with the neutral partner message', async () => {
    gateConRpc(jest.fn().mockResolvedValue({ data: { ok: true, encontrada: false }, error: null }))
    expect(await buscarParejaPorCedula(TALLER_ID, '12345678')).toEqual({
      ok: true,
      encontrada: false,
      message:
        'No pudimos confirmar a tu pareja con esos datos. Revisa la cédula o pide ayuda a la coordinación del taller.',
    })
  })

  it.each([
    ['LIMITE_ALCANZADO', /demasiadas búsquedas/i],
    ['EDICION_NOT_FOUND', /edición/i],
  ])('maps the returned %s to its message', async (codigo, mensaje) => {
    gateConRpc(jest.fn().mockResolvedValue({ data: { ok: false, codigo }, error: null }))
    const result = await buscarParejaPorCedula(TALLER_ID, '12345678')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected ok:false')
    expect(result.error).toBe(codigo)
    expect(result.message).toMatch(mensaje)
  })

  it('maps a raised 22023 CEDULA_INVALIDA', async () => {
    gateConRpc(jest.fn().mockResolvedValue({ data: null, error: { code: '22023', message: 'CEDULA_INVALIDA' } }))
    const result = await buscarParejaPorCedula(TALLER_ID, '12345678')
    expect(result).toEqual({ ok: false, error: 'CEDULA_INVALIDA', message: expect.stringMatching(/cédula/i) })
  })

  it('rejects an unrecognizable cédula before calling the RPC (no throttle unit spent)', async () => {
    const rpc = jest.fn()
    gateConRpc(rpc)
    const result = await buscarParejaPorCedula(TALLER_ID, 'abc')
    expect(result).toEqual({ ok: false, error: 'CEDULA_INVALIDA', message: expect.any(String) })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects a missing edición id as invalid-input', async () => {
    const rpc = jest.fn()
    gateConRpc(rpc)
    expect(await buscarParejaPorCedula('', '12345678')).toEqual({
      ok: false,
      error: 'invalid-input',
      message: expect.any(String),
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('treats an off-contract answer as internal', async () => {
    gateConRpc(jest.fn().mockResolvedValue({ data: { ok: true }, error: null }))
    expect(await buscarParejaPorCedula(TALLER_ID, '12345678')).toEqual({
      ok: false,
      error: 'internal',
      message: expect.any(String),
    })
  })
})
