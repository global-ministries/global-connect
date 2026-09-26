/**
 * @jest-environment node
 *
 * T3 (odd/tasks/talleres-configuracion-del-taller.md) — server actions for
 * /talleres/[taller]'s own mutations (cabecera, plantilla clases/grupos/
 * facilitadores). The gate is intentionally thin — flag + authenticated
 * session only, same philosophy as requireTalleresApiAuthenticated /
 * talleres_asignar_inscripciones_a_grupo's route (asignar-grupo/route.ts):
 * authorization stays in the DB (RLS on the plantilla tables, the
 * NO_ES_SERVIDOR_ACTIVO_DEL_TALLER trigger), never re-implemented here.
 *
 * This file only covers updateTallerNombre; the plantilla clase/grupo/
 * facilitador actions are added alongside their own components later in
 * T3 (see the components' own tests for that coverage).
 */

import { updateTallerNombre } from '@/app/(auth)/talleres/[taller]/actions'

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

interface SetupOpts {
  isEnabled?: boolean
  user?: { id: string } | null
  updateResult?: { data: unknown; error: { message?: string; code?: string } | null }
}

function setup(opts: SetupOpts): void {
  flagsMock.mockReset().mockReturnValue(opts.isEnabled ?? true)
  const single = jest.fn().mockResolvedValue(
    opts.updateResult ?? { data: { nombre: 'Nuevo nombre' }, error: null },
  )
  const select = jest.fn().mockReturnValue({ single })
  const eq = jest.fn().mockReturnValue({ select })
  const update = jest.fn().mockReturnValue({ eq })
  const from = jest.fn().mockReturnValue({ update })

  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: opts.user === undefined ? { id: 'auth-1' } : opts.user },
        error: null,
      }),
    },
    from,
  })
}

const validInput = { tallerId: 't-1', tallerSlug: 'proximo-paso', nombre: 'Nuevo nombre' }

beforeEach(() => {
  revalidatePathMock.mockReset()
})

describe('updateTallerNombre — kill switch & auth', () => {
  it('returns not-found when the talleres flag is off', async () => {
    setup({ isEnabled: false })
    const result = await updateTallerNombre(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not-found')
  })

  it('returns unauthorized when there is no session', async () => {
    setup({ user: null })
    const result = await updateTallerNombre(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('unauthorized')
  })
})

describe('updateTallerNombre — input validation', () => {
  it('rejects a nombre shorter than 2 characters', async () => {
    setup({})
    const result = await updateTallerNombre({ ...validInput, nombre: 'A' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('trims the nombre before sending it', async () => {
    setup({})
    await updateTallerNombre({ ...validInput, nombre: '  Nuevo nombre  ' })
    const client = await createSupabaseServerClientMock.mock.results[0].value
    expect(client.from).toHaveBeenCalledWith('talleres')
    expect(client.from('talleres').update).toHaveBeenCalledWith({ nombre: 'Nuevo nombre' })
  })
})

describe('updateTallerNombre — happy path', () => {
  it('updates the row and revalidates the taller page', async () => {
    setup({})
    const result = await updateTallerNombre(validInput)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.nombre).toBe('Nuevo nombre')
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/proximo-paso')
  })
})

describe('updateTallerNombre — RLS denial', () => {
  it('maps a bare 42501 to a friendly forbidden message', async () => {
    setup({
      updateResult: {
        data: null,
        error: { code: '42501', message: 'new row violates row-level security policy' },
      },
    })
    const result = await updateTallerNombre(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('forbidden')
      expect(result.message).toMatch(/permisos/i)
    }
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})
