/**
 * @jest-environment node
 *
 * T4 (odd/tasks/talleres-configuracion-del-taller.md) — server action for
 * /talleres/[taller]/[edicion]/[grupo]'s clase-in-place edit
 * (talleres_editar_clase: tema + fecha_programada while the clase isn't
 * cerrada). Gate mirrors the sibling edición actions file's thin gate
 * (flag + authenticated session only); authorization and the CLASE_CERRADA
 * guard both live in the RPC.
 */

import { editarClaseInstanciada } from '@/app/(auth)/talleres/[taller]/[edicion]/[grupo]/actions'

jest.mock('@/lib/platform/talleres/flags', () => ({
  isTalleresEnabled: jest.fn(() => true),
}))

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags').isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const revalidatePathMock = jest.requireMock('next/cache').revalidatePath as jest.Mock

interface Setup {
  isEnabled?: boolean
  user?: { id: string } | null
  rpcResult?: { data: unknown; error: { message?: string; code?: string } | null }
}

function setup(opts: Setup): { rpc: jest.Mock } {
  flagsMock.mockReset().mockReturnValue(opts.isEnabled ?? true)
  const rpc = jest.fn().mockResolvedValue(opts.rpcResult ?? { data: { id: 's-1' }, error: null })

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

const validInput = {
  tallerSlug: 'proximo-paso',
  edicionId: 'e-1',
  grupoId: 'g-1',
  sesionId: 's-1',
  tema: 'Intimidad con Dios',
  fechaProgramada: '2026-10-13',
}

describe('editarClaseInstanciada — kill switch & auth', () => {
  it('returns not-found when the talleres flag is off', async () => {
    setup({ isEnabled: false })
    const result = await editarClaseInstanciada(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not-found')
  })

  it('returns unauthorized when there is no session', async () => {
    setup({ user: null })
    const result = await editarClaseInstanciada(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('unauthorized')
  })
})

describe('editarClaseInstanciada — input validation', () => {
  it('rejects a blank tema', async () => {
    setup({})
    const result = await editarClaseInstanciada({ ...validInput, tema: '   ' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects a blank fechaProgramada', async () => {
    setup({})
    const result = await editarClaseInstanciada({ ...validInput, fechaProgramada: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })
})

describe('editarClaseInstanciada — happy path', () => {
  it('calls talleres_editar_clase and revalidates the grupo page', async () => {
    const { rpc } = setup({})
    const result = await editarClaseInstanciada(validInput)
    expect(result.ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith('talleres_editar_clase', {
      p_sesion_id: 's-1',
      p_tema: 'Intimidad con Dios',
      p_fecha_programada: '2026-10-13',
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso/e-1/g-1')
  })
})

describe('editarClaseInstanciada — clase cerrada', () => {
  it('maps CLASE_CERRADA to the friendly Spanish message', async () => {
    setup({ rpcResult: { data: null, error: { code: 'P0001', message: 'CLASE_CERRADA' } } })
    const result = await editarClaseInstanciada(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toBe('Esta clase ya está cerrada; no admite cambios.')
    }
  })
})

describe('editarClaseInstanciada — RLS denial', () => {
  it('maps sin_permisos_para_este_taller (42501) to a friendly forbidden message', async () => {
    setup({ rpcResult: { data: null, error: { code: '42501', message: 'sin_permisos_para_este_taller' } } })
    const result = await editarClaseInstanciada(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('forbidden')
      expect(result.message).toMatch(/no tienes permisos/i)
    }
  })
})
