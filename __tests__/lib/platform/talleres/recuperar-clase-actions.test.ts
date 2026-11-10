/**
 * @jest-environment node
 *
 * T8b (odd/tasks/talleres-reserva-publica.md, S17) — server actions of the
 * recovered clase: gate (flag + session), validation before any RPC, the
 * exact RPC arguments, error translation, revalidation, and the
 * «Recuperar clases aparte» switch.
 */

import {
  anularRecuperacion,
  guardarPermiteRecuperar,
  leerPermiteRecuperar,
  registrarRecuperacion,
} from '@/lib/platform/talleres/recuperar-clase-actions'

jest.mock('@/lib/platform/talleres/flags', () => ({ isTalleresEnabled: jest.fn(() => true) }))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags').isTalleresEnabled as jest.Mock
const clientMock = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const revalidateMock = jest.requireMock('next/cache').revalidatePath as jest.Mock

interface Setup {
  enabled?: boolean
  user?: { id: string } | null
  rpc?: { data: unknown; error: { message?: string; code?: string } | null }
  from?: unknown
}

function setup(opts: Setup = {}): { rpc: jest.Mock } {
  flagsMock.mockReset().mockReturnValue(opts.enabled ?? true)
  const rpc = jest.fn().mockResolvedValue(opts.rpc ?? { data: { id: 'r-1' }, error: null })
  clientMock.mockReset().mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: opts.user === undefined ? { id: 'auth-1' } : opts.user } }) },
    rpc,
    from: opts.from,
  })
  return { rpc }
}

beforeEach(() => {
  revalidateMock.mockReset()
})

const RUTA = { tallerSlug: 'mujer-de-hoy', edicionId: 'e-1', grupoId: 'g-1' }
const REGISTRO = { ...RUTA, sesionId: 's-1', personaId: 'p-1', fecha: '2026-10-24', dadaPor: 'f-1', nota: '  Con el grupo 3  ' }

describe('gate', () => {
  it('flag off → not-found, no RPC', async () => {
    const { rpc } = setup({ enabled: false })
    await expect(registrarRecuperacion(REGISTRO)).resolves.toEqual({
      ok: false, error: 'not-found', message: 'El módulo de talleres está deshabilitado.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('no session → unauthorized, no RPC', async () => {
    const { rpc } = setup({ user: null })
    await expect(anularRecuperacion({ ...RUTA, recuperacionId: 'r-1' })).resolves.toEqual({
      ok: false, error: 'unauthorized', message: 'Necesitas iniciar sesión.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('registrarRecuperacion', () => {
  it('calls the RPC with the trimmed nota and revalidates the grupo', async () => {
    const { rpc } = setup()
    await expect(registrarRecuperacion(REGISTRO)).resolves.toEqual({ ok: true, id: 'r-1' })
    expect(rpc).toHaveBeenCalledWith('talleres_registrar_recuperacion', {
      p_sesion_id: 's-1', p_persona_id: 'p-1', p_fecha: '2026-10-24', p_dada_por: 'f-1', p_nota: 'Con el grupo 3',
    })
    expect(revalidateMock).toHaveBeenCalledWith('/talleres/mujer-de-hoy/e-1/g-1')
  })

  it('an empty nota and no dada_por travel as null', async () => {
    const { rpc } = setup()
    await registrarRecuperacion({ ...REGISTRO, dadaPor: null, nota: '   ' })
    expect(rpc).toHaveBeenCalledWith('talleres_registrar_recuperacion', expect.objectContaining({ p_dada_por: null, p_nota: null }))
  })

  it('refuses a bad date or a long nota before any RPC', async () => {
    const { rpc } = setup()
    await expect(registrarRecuperacion({ ...REGISTRO, fecha: '' })).resolves.toEqual({
      ok: false, error: 'invalid-input', message: 'Elige la fecha de la recuperación.',
    })
    await expect(registrarRecuperacion({ ...REGISTRO, nota: 'x'.repeat(301) })).resolves.toEqual({
      ok: false, error: 'invalid-input', message: 'La nota no puede superar los 300 caracteres.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('translates the RPC refusal and does not revalidate', async () => {
    setup({ rpc: { data: null, error: { code: 'P0001', message: 'PERSONA_NO_AUSENTE' } } })
    await expect(registrarRecuperacion(REGISTRO)).resolves.toEqual({
      ok: false, error: 'conflict', message: 'Solo se recupera una clase a la que la persona faltó en este grupo.',
    })
    expect(revalidateMock).not.toHaveBeenCalled()
  })
})

describe('anularRecuperacion', () => {
  it('calls the RPC and revalidates', async () => {
    const { rpc } = setup({ rpc: { data: { id: 'r-1', anulada: true }, error: null } })
    await expect(anularRecuperacion({ ...RUTA, recuperacionId: 'r-1' })).resolves.toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('talleres_anular_recuperacion', { p_id: 'r-1' })
    expect(revalidateMock).toHaveBeenCalledWith('/talleres/mujer-de-hoy/e-1/g-1')
  })

  it('translates a forbidden caller', async () => {
    setup({ rpc: { data: null, error: { code: '42501', message: 'sin_permisos_para_este_grupo' } } })
    await expect(anularRecuperacion({ ...RUTA, recuperacionId: 'r-1' })).resolves.toEqual({
      ok: false, error: 'forbidden', message: 'Solo el líder del grupo o la coordinación del taller registran recuperaciones.',
    })
  })
})

describe('the switch', () => {
  function tabla(result: { data: unknown; error: unknown }) {
    const chain: Record<'select' | 'update' | 'eq' | 'maybeSingle', jest.Mock> & {
      then: (resolve: (v: unknown) => unknown) => Promise<unknown>
    } = {
      select: jest.fn(),
      update: jest.fn(),
      eq: jest.fn(),
      maybeSingle: jest.fn(() => Promise.resolve(result)),
      then: (resolve) => Promise.resolve(result).then(resolve),
    }
    chain.select.mockReturnValue(chain)
    chain.update.mockReturnValue(chain)
    chain.eq.mockReturnValue(chain)
    return { from: jest.fn(() => chain), chain }
  }

  it('reads permite_recuperar_clases', async () => {
    const t = tabla({ data: { permite_recuperar_clases: false }, error: null })
    setup({ from: t.from })
    await expect(leerPermiteRecuperar('t-1')).resolves.toEqual({ ok: true, permite: false })
    expect(t.chain.select).toHaveBeenCalledWith('permite_recuperar_clases')
    expect(t.chain.eq).toHaveBeenCalledWith('id', 't-1')
  })

  it('saves it and revalidates the taller', async () => {
    const t = tabla({ data: [{ id: 't-1' }], error: null })
    setup({ from: t.from })
    await expect(guardarPermiteRecuperar({ tallerId: 't-1', tallerSlug: 'mujer-de-hoy', permite: false })).resolves.toEqual({ ok: true })
    expect(t.chain.update).toHaveBeenCalledWith({ permite_recuperar_clases: false })
    expect(revalidateMock).toHaveBeenCalledWith('/talleres/mujer-de-hoy')
  })

  it('no row updated (RLS) → forbidden', async () => {
    const t = tabla({ data: [], error: null })
    setup({ from: t.from })
    await expect(guardarPermiteRecuperar({ tallerId: 't-1', tallerSlug: 'mujer-de-hoy', permite: true })).resolves.toEqual({
      ok: false, error: 'forbidden', message: 'No tienes permisos para hacer este cambio.',
    })
    expect(revalidateMock).not.toHaveBeenCalled()
  })
})
