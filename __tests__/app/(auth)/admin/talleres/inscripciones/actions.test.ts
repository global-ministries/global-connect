/**
 * @jest-environment node
 *
 * PR42 — Tests for the `/admin/talleres/inscripciones` server actions.
 *
 * Covers:
 *   - approveInscripcionAction: requires one of director.write |
 *     admin.manage | coordinator.write; updates only when the row
 *     is currently `pendiente`; revalidates the page.
 *   - rejectInscripcionAction: same capability gate; motivo is
 *     REQUIRED (trigger enforcement + client validation); updates
 *     only when pendiente; writes motivo_no_aprobado.
 *   - Error paths: unset user, no session, missing capability,
 *     empty motivo, no-op on already-approved rows.
 *
 * Mocks both `flags` and `platformSessionReadOnly` (the auth gate).
 * The supabase client is built per-test via the gate's return value.
 */

import {
  approveInscripcionAction,
  rejectInscripcionAction,
} from '@/app/(auth)/admin/talleres/inscripciones/actions'

jest.mock('@/lib/platform/talleres/flags', () => ({
  isTalleresEnabled: jest.fn(),
}))

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

jest.mock('@/lib/auth/platformSessionReadOnly', () => ({
  findPlatformSessionPersonaByAuthId: jest.fn(),
  resolveReadOnlyPlatformSession: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

const isTalleresEnabledMock = jest.requireMock('@/lib/platform/talleres/flags')
  .isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const resolveSessionMock = jest.requireMock('@/lib/auth/platformSessionReadOnly')
  .resolveReadOnlyPlatformSession as jest.Mock
const revalidatePathMock = jest.requireMock('next/cache')
  .revalidatePath as jest.Mock

const AUTH_UID = 'auth-uid-1'
const INSCRIPCION_ID = 'insc-1'

type Capability =
  | 'talleres_crecimiento.director.read'
  | 'talleres_crecimiento.director.write'
  | 'talleres_crecimiento.admin.manage'
  | 'talleres_crecimiento.coordinator.read'
  | 'talleres_crecimiento.coordinator.write'
  | 'talleres_crecimiento.participation.read'
  | 'talleres_crecimiento.lead.read'

function setupMocks(opts: {
  flagEnabled?: boolean
  user?: { id: string } | null
  capabilities?: Capability[]
}) {
  isTalleresEnabledMock.mockReset().mockReturnValue(opts.flagEnabled ?? true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- thenable chain
  const updateBuilder: Record<string, any> = {}
  updateBuilder['eq'] = jest.fn(() => updateBuilder)
  updateBuilder['select'] = jest.fn(() => updateBuilder)
  updateBuilder['maybeSingle'] = jest.fn(() =>
    Promise.resolve({
      data: { id: INSCRIPCION_ID },
      error: null,
    }),
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase client
  const client: any = {
    from: jest.fn(() => ({
      update: jest.fn(() => updateBuilder),
    })),
  }

  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: opts.user === null ? null : (opts.user ?? { id: AUTH_UID }) },
        error: null,
      }),
    },
    from: client.from,
  })

  resolveSessionMock.mockReset().mockResolvedValue({
    personaId: 'u-1',
    subjectAuthId: AUTH_UID,
    globalRoles: [],
    contexts: [],
    capabilities: (opts.capabilities ?? []).map((key) => ({
      key,
      experience: 'talleres_crecimiento',
      scopeType: 'taller',
      source: 'test',
    })),
  })

  revalidatePathMock.mockReset()

  return { client, updateBuilder }
}

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── approveInscripcionAction — happy path ──────────────────────────────────

describe('approveInscripcionAction — happy path', () => {
  it('director.write holder approves a pendiente row', async () => {
    const { updateBuilder } = setupMocks({
      capabilities: ['talleres_crecimiento.director.write'],
    })
    const result = await approveInscripcionAction(INSCRIPCION_ID)
    expect(result.ok).toBe(true)
    expect(updateBuilder['eq']).toHaveBeenCalledWith('id', INSCRIPCION_ID)
    expect(updateBuilder['eq']).toHaveBeenCalledWith('estado', 'pendiente')
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/talleres/inscripciones')
  })

  it('admin.manage holder also approves (multi-cap gate)', async () => {
    const { client } = setupMocks({
      capabilities: ['talleres_crecimiento.admin.manage'],
    })
    const result = await approveInscripcionAction(INSCRIPCION_ID)
    expect(result.ok).toBe(true)
    expect(client.from).toHaveBeenCalledWith('taller_inscripciones')
  })

  it('coordinator.write holder also approves (multi-cap gate)', async () => {
    const { updateBuilder } = setupMocks({
      capabilities: ['talleres_crecimiento.coordinator.write'],
    })
    const result = await approveInscripcionAction(INSCRIPCION_ID)
    expect(result.ok).toBe(true)
    expect(updateBuilder['eq']).toHaveBeenCalledWith('id', INSCRIPCION_ID)
  })
})

// ─── approveInscripcionAction — rejections ──────────────────────────────────

describe('approveInscripcionAction — error paths', () => {
  it('returns talleres-disabled when the flag is off', async () => {
    setupMocks({
      flagEnabled: false,
      capabilities: ['talleres_crecimiento.admin.manage'],
    })
    const result = await approveInscripcionAction(INSCRIPCION_ID)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('talleres-disabled')
  })

  it('returns UNAUTHENTICATED when no user is signed in', async () => {
    setupMocks({
      user: null,
      capabilities: ['talleres_crecimiento.admin.manage'],
    })
    const result = await approveInscripcionAction(INSCRIPCION_ID)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('UNAUTHENTICATED')
  })

  it('returns FORBIDDEN when the user has no write capability', async () => {
    setupMocks({
      capabilities: ['talleres_crecimiento.participation.read'],
    })
    const result = await approveInscripcionAction(INSCRIPCION_ID)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('FORBIDDEN')
  })

  it('returns NOT_FOUND_OR_NOT_PENDIENTE when the UPDATE is a no-op', async () => {
    // The maybeSingle mock returns null when the WHERE clause
    // matches nothing (the row is already aprobado, not pendiente).
    setupMocks({
      capabilities: ['talleres_crecimiento.admin.manage'],
    })
    // Override the maybeSingle to return null (no row matched).
    // We can do this by replacing the mock on the client.
    // Easier: re-mock the chain.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recursive chain mock
    const updateBuilder: Record<string, any> = {
      eq: jest.fn(),
      select: jest.fn(),
      maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
    }
    updateBuilder['eq'] = jest.fn(() => updateBuilder)
    updateBuilder['select'] = jest.fn(() => updateBuilder)
    createSupabaseServerClientMock.mockReset().mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: AUTH_UID } },
          error: null,
        }),
      },
      from: jest.fn(() => ({
        update: jest.fn(() => updateBuilder),
      })),
    })

    const result = await approveInscripcionAction(INSCRIPCION_ID)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('NOT_FOUND_OR_NOT_PENDIENTE')
  })

  it('returns UPDATE_FAILED when the underlying UPDATE errors', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recursive chain mock
    const updateBuilder: Record<string, any> = {
      maybeSingle: jest.fn(() =>
        Promise.resolve({ data: null, error: { message: 'sql boom' } }),
      ),
    }
    updateBuilder['eq'] = jest.fn(() => updateBuilder)
    updateBuilder['select'] = jest.fn(() => updateBuilder)
    createSupabaseServerClientMock.mockReset().mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: AUTH_UID } },
          error: null,
        }),
      },
      from: jest.fn(() => ({
        update: jest.fn(() => updateBuilder),
      })),
    })
    resolveSessionMock.mockReset().mockResolvedValue({
      personaId: 'u-1',
      subjectAuthId: AUTH_UID,
      globalRoles: [],
      contexts: [],
      capabilities: [
        { key: 'talleres_crecimiento.admin.manage', experience: 'talleres_crecimiento', scopeType: 'taller', source: 'test' },
      ],
    })
    isTalleresEnabledMock.mockReturnValue(true)

    const result = await approveInscripcionAction(INSCRIPCION_ID)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('UPDATE_FAILED')
    expect(result.message).toContain('sql boom')
  })
})

// ─── rejectInscripcionAction — happy path ───────────────────────────────────

describe('rejectInscripcionAction — happy path', () => {
  it('writes estado=no_aprobado + motivo_no_aprobado and revalidates', async () => {
    const { client } = setupMocks({
      capabilities: ['talleres_crecimiento.coordinator.write'],
    })
    const update = jest.fn(() => ({
      eq: jest.fn(() => ({
        eq: jest.fn(() => ({
          select: jest.fn(() => ({
            maybeSingle: jest.fn(() => Promise.resolve({ data: { id: INSCRIPCION_ID }, error: null })),
          })),
        })),
      })),
    }))
    client.from.mockReturnValue({ update })
    // Re-create the supabase facade with the custom update chain.
    createSupabaseServerClientMock.mockReset().mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: AUTH_UID } },
          error: null,
        }),
      },
      from: client.from,
    })

    const result = await rejectInscripcionAction(INSCRIPCION_ID, '  cupo lleno  ')
    expect(result.ok).toBe(true)
    expect(update).toHaveBeenCalledWith({
      estado: 'no_aprobado',
      motivo_no_aprobado: 'cupo lleno', // trimmed
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/talleres/inscripciones')
  })

  it('director.write holder also rejects', async () => {
    const { client } = setupMocks({
      capabilities: ['talleres_crecimiento.director.write'],
    })
    const update = jest.fn(() => ({
      eq: jest.fn(() => ({
        eq: jest.fn(() => ({
          select: jest.fn(() => ({
            maybeSingle: jest.fn(() => Promise.resolve({ data: { id: INSCRIPCION_ID }, error: null })),
          })),
        })),
      })),
    }))
    client.from.mockReturnValue({ update })
    createSupabaseServerClientMock.mockReset().mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: AUTH_UID } },
          error: null,
        }),
      },
      from: client.from,
    })

    const result = await rejectInscripcionAction(INSCRIPCION_ID, 'motivo válido')
    expect(result.ok).toBe(true)
  })
})

// ─── rejectInscripcionAction — motivo validation ────────────────────────────

describe('rejectInscripcionAction — motivo validation', () => {
  it('returns INVALID_MOTIVO when motivo is empty (no auth gate run)', async () => {
    const result = await rejectInscripcionAction(INSCRIPCION_ID, '')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('INVALID_MOTIVO')
    // The auth gate is NOT consulted when motivo is empty.
    expect(resolveSessionMock).not.toHaveBeenCalled()
  })

  it('returns INVALID_MOTIVO when motivo is whitespace only', async () => {
    const result = await rejectInscripcionAction(INSCRIPCION_ID, '   \n  ')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('INVALID_MOTIVO')
  })

  it('returns INVALID_MOTIVO when motivo is undefined', async () => {
    // The runtime narrows the parameter to string; passing undefined
    // tests the defensive fallback.
    const result = await rejectInscripcionAction(
      INSCRIPCION_ID,
      undefined as unknown as string,
    )
    expect(result.ok).toBe(false)
    expect(result.error).toBe('INVALID_MOTIVO')
  })
})

// ─── rejectInscripcionAction — error paths ──────────────────────────────────

describe('rejectInscripcionAction — error paths', () => {
  it('returns FORBIDDEN when the user has no write capability', async () => {
    setupMocks({
      capabilities: ['talleres_crecimiento.coordinator.read'],
    })
    const result = await rejectInscripcionAction(INSCRIPCION_ID, 'motivo válido')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('FORBIDDEN')
  })

  it('returns UPDATE_FAILED when the underlying UPDATE errors', async () => {
    const update = jest.fn(() => ({
      eq: jest.fn(() => ({
        eq: jest.fn(() => ({
          select: jest.fn(() => ({
            maybeSingle: jest.fn(() =>
              Promise.resolve({ data: null, error: { message: 'trigger fail' } }),
            ),
          })),
        })),
      })),
    }))
    createSupabaseServerClientMock.mockReset().mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: AUTH_UID } },
          error: null,
        }),
      },
      from: jest.fn(() => ({ update })),
    })
    resolveSessionMock.mockReset().mockResolvedValue({
      personaId: 'u-1',
      subjectAuthId: AUTH_UID,
      globalRoles: [],
      contexts: [],
      capabilities: [
        { key: 'talleres_crecimiento.admin.manage', experience: 'talleres_crecimiento', scopeType: 'taller', source: 'test' },
      ],
    })
    isTalleresEnabledMock.mockReturnValue(true)

    const result = await rejectInscripcionAction(INSCRIPCION_ID, 'motivo válido')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('UPDATE_FAILED')
  })
})

// ─── empty inscripcionId ─────────────────────────────────────────────────────

describe('inscripcionId guard', () => {
  it('approve returns NOT_FOUND_OR_NOT_PENDIENTE for empty id', async () => {
    const result = await approveInscripcionAction('')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('NOT_FOUND_OR_NOT_PENDIENTE')
  })

  it('reject returns NOT_FOUND_OR_NOT_PENDIENTE for empty id (before motivo check)', async () => {
    // The empty-id check runs first, so the order is intentionally
    // NOT_FOUND_OR_NOT_PENDIENTE rather than INVALID_MOTIVO.
    const result = await rejectInscripcionAction('', 'motivo válido')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('NOT_FOUND_OR_NOT_PENDIENTE')
  })
})
