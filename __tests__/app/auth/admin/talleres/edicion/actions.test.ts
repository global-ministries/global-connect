/**
 * @jest-environment node
 *
 * PR36 — Tests for the openExistingEdicionAction / closeExistingEdicionAction
 * server actions (Bug #2 fix).
 *
 * These actions live in
 *   app/(auth)/admin/talleres/edicion/[id]/actions.ts
 * and gate state transitions on the edicion detail page (PR34's
 * read-only page).
 *
 * Covers:
 *   - kill switch (isTalleresEnabled)
 *   - auth gate
 *   - capability gate (director.write OR admin.manage)
 *   - happy path: each transition writes the expected estado
 *   - state-predicate guard: NOT_FOUND_OR_NOT_BORRADOR (open)
 *     and NOT_FOUND_OR_NOT_ACTIVE (close) when the row is in the
 *     wrong state.
 *   - revalidation paths
 */

import {
  closeExistingEdicionAction,
  openExistingEdicionAction,
} from '@/app/(auth)/admin/talleres/edicion/[id]/actions'

jest.mock('@/lib/platform/talleres/flags', () => ({
  isTalleresEnabled: jest.fn(() => true),
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

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags')
  .isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const resolveSessionMock = jest.requireMock(
  '@/lib/auth/platformSessionReadOnly',
).resolveReadOnlyPlatformSession as jest.Mock
const revalidatePathMock = jest.requireMock('next/cache')
  .revalidatePath as jest.Mock

// ─── Update chain recorder ──────────────────────────────────────────
// We don't need a full TypeScript-imitation of the Supabase chain —
// we just record what the action called. The fluent chain is:
//   .update({ ... })
//   .eq('id', x)
//   .[eq|in]('estado', y)
//   .select('id, taller_id, estado')
//   .maybeSingle()
//
// The recorder takes a SHARED `rec` object so writes from inside
// the chain (update(), eq(), in()) propagate back to the test
// scope, where we assert on the exact SQL the action issued.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface UpdateRecorder {
  updatePayload: Record<string, unknown> | null
  estadoFilter: { kind: 'eq' | 'in'; value: unknown } | null
  eqId: string | null
  response:
    | { data: { id: string; taller_id: string; estado: string } | null; error: null }
    | { data: null; error: { message: string } | null }
}

function makeMockClient(rec: UpdateRecorder) {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'auth-1' } },
        error: null,
      }),
    },
    from(_table: string) {
      return {
        update(payload: Record<string, unknown>) {
          rec.updatePayload = { ...payload }
          return {
            eq(column: string, value: unknown) {
              if (column === 'id') {
                rec.eqId = String(value)
              }
              return {
                eq(column: string, value: unknown) {
                  if (column === 'estado') {
                    rec.estadoFilter = { kind: 'eq', value }
                  }
                  return {
                    select() {
                      return this
                    },
                    maybeSingle: () => Promise.resolve(rec.response),
                  }
                },
                in(column: string, values: unknown[]) {
                  if (column === 'estado') {
                    rec.estadoFilter = { kind: 'in', value: values }
                  }
                  return {
                    select() {
                      return this
                    },
                    maybeSingle: () => Promise.resolve(rec.response),
                  }
                },
                select() {
                  return this
                },
                maybeSingle: () => Promise.resolve(rec.response),
              }
            },
            in(column: string, values: unknown[]) {
              if (column === 'estado') {
                rec.estadoFilter = { kind: 'in', value: values }
              }
              return {
                select() {
                  return this
                },
                maybeSingle: () => Promise.resolve(rec.response),
              }
            },
          }
        },
      }
    },
  }
}

function makeUnauthenticatedClient() {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: null },
        error: null,
      }),
    },
    from: jest.fn(),
  }
}

function freshRecorder(
  response: UpdateRecorder['response'] = {
    data: null,
    error: { message: 'no response configured' },
  },
): UpdateRecorder {
  return {
    updatePayload: null,
    estadoFilter: null,
    eqId: null,
    response,
  }
}

beforeEach(() => {
  flagsMock.mockReset().mockReturnValue(true)
  createSupabaseServerClientMock.mockReset().mockResolvedValue(
    makeMockClient(
      freshRecorder({
        data: null,
        error: { message: 'no response configured' },
      }),
    ),
  )
  resolveSessionMock.mockReset().mockResolvedValue({
    personaId: 'p-1',
    subjectAuthId: 'auth-1',
    globalRoles: [],
    contexts: [],
    capabilities: [{ key: 'talleres_crecimiento.admin.manage' }],
  })
  revalidatePathMock.mockReset()
})

// ─── openExistingEdicionAction ──────────────────────────────────────

describe('openExistingEdicionAction — kill switch', () => {
  it('returns ok:false error:talleres-disabled when isTalleresEnabled is false', async () => {
    flagsMock.mockReturnValue(false)
    const result = await openExistingEdicionAction('e-1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('talleres-disabled')
  })
})

describe('openExistingEdicionAction — auth + capability gate', () => {
  it('returns UNAUTHENTICATED when no user is signed in', async () => {
    createSupabaseServerClientMock.mockReset().mockResolvedValueOnce(
      makeUnauthenticatedClient(),
    )
    const result = await openExistingEdicionAction('e-1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('UNAUTHENTICATED')
  })

  it('returns NO_SESSION when persona resolution fails', async () => {
    resolveSessionMock.mockResolvedValueOnce(null)
    const result = await openExistingEdicionAction('e-1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('NO_SESSION')
  })

  it('returns FORBIDDEN when neither director.write nor admin.manage is held', async () => {
    resolveSessionMock.mockReset().mockResolvedValueOnce({
      personaId: 'p-1',
      subjectAuthId: 'auth-1',
      globalRoles: [],
      contexts: [],
      capabilities: [
        { key: 'talleres_crecimiento.participation.read' },
      ],
    })
    const result = await openExistingEdicionAction('e-1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('FORBIDDEN')
  })
})

describe('openExistingEdicionAction — empty edicionId', () => {
  it('returns NOT_FOUND_OR_NOT_BORRADOR when edicionId is empty', async () => {
    const result = await openExistingEdicionAction('')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('NOT_FOUND_OR_NOT_BORRADOR')
  })
})

describe('openExistingEdicionAction — happy path', () => {
  it('flips estado to abierto when the row was in borrador', async () => {
    const rec = freshRecorder({
      data: { id: 'e-1', taller_id: 't-1', estado: 'abierto' },
      error: null,
    })
    createSupabaseServerClientMock.mockReset().mockResolvedValueOnce(
      makeMockClient(rec),
    )
    const result = await openExistingEdicionAction('e-1')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.message).toMatch(/abierta/i)
    expect(rec.updatePayload).toEqual({ estado: 'abierto' })
    expect(rec.eqId).toBe('e-1')
    expect(rec.estadoFilter).toEqual({ kind: 'eq', value: 'borrador' })
    expect(revalidatePathMock).toHaveBeenCalledWith(
      '/admin/talleres/edicion/e-1',
    )
  })

  it('returns NOT_FOUND_OR_NOT_BORRADOR when the UPDATE returns null (predicate mismatch)', async () => {
    const rec = freshRecorder({ data: null, error: null })
    createSupabaseServerClientMock.mockReset().mockResolvedValueOnce(
      makeMockClient(rec),
    )
    const result = await openExistingEdicionAction('e-1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('NOT_FOUND_OR_NOT_BORRADOR')
  })

  it('returns UPDATE_FAILED when the Supabase UPDATE errors', async () => {
    const rec = freshRecorder({
      data: null,
      error: { message: 'RLS denied' },
    })
    createSupabaseServerClientMock.mockReset().mockResolvedValueOnce(
      makeMockClient(rec),
    )
    const result = await openExistingEdicionAction('e-1')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('UPDATE_FAILED')
      expect(result.message).toBe('RLS denied')
    }
  })
})

// ─── closeExistingEdicionAction ─────────────────────────────────────

describe('closeExistingEdicionAction — kill switch', () => {
  it('returns ok:false error:talleres-disabled when isTalleresEnabled is false', async () => {
    flagsMock.mockReturnValue(false)
    const result = await closeExistingEdicionAction('e-1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('talleres-disabled')
  })
})

describe('closeExistingEdicionAction — auth + capability gate', () => {
  it('returns UNAUTHENTICATED when no user is signed in', async () => {
    createSupabaseServerClientMock.mockReset().mockResolvedValueOnce(
      makeUnauthenticatedClient(),
    )
    const result = await closeExistingEdicionAction('e-1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('UNAUTHENTICATED')
  })

  it('returns FORBIDDEN when neither capability is held', async () => {
    resolveSessionMock.mockReset().mockResolvedValueOnce({
      personaId: 'p-1',
      subjectAuthId: 'auth-1',
      globalRoles: [],
      contexts: [],
      capabilities: [
        { key: 'talleres_crecimiento.coordinator.read' },
      ],
    })
    const result = await closeExistingEdicionAction('e-1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('FORBIDDEN')
  })
})

describe('closeExistingEdicionAction — happy path', () => {
  it('returns ok:true when the UPDATE writes the row', async () => {
    const rec = freshRecorder({
      data: { id: 'e-1', taller_id: 't-1', estado: 'cerrado' },
      error: null,
    })
    createSupabaseServerClientMock.mockReset().mockResolvedValueOnce(
      makeMockClient(rec),
    )
    const result = await closeExistingEdicionAction('e-1')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.message).toMatch(/cerrada/i)
    expect(rec.updatePayload).toEqual({ estado: 'cerrado' })
    expect(rec.estadoFilter).toEqual({
      kind: 'in',
      value: ['abierto', 'en_curso'],
    })
    expect(revalidatePathMock).toHaveBeenCalledWith(
      '/admin/talleres/edicion/e-1',
    )
  })

  it('returns NOT_FOUND_OR_NOT_ACTIVE when the predicate rejects the row', async () => {
    const rec = freshRecorder({ data: null, error: null })
    createSupabaseServerClientMock.mockReset().mockResolvedValueOnce(
      makeMockClient(rec),
    )
    const result = await closeExistingEdicionAction('e-1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('NOT_FOUND_OR_NOT_ACTIVE')
  })

  it('returns UPDATE_FAILED on Supabase error', async () => {
    const rec = freshRecorder({
      data: null,
      error: { message: 'network blip' },
    })
    createSupabaseServerClientMock.mockReset().mockResolvedValueOnce(
      makeMockClient(rec),
    )
    const result = await closeExistingEdicionAction('e-1')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('UPDATE_FAILED')
      expect(result.message).toBe('network blip')
    }
  })
})