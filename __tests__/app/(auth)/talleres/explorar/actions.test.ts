/**
 * @jest-environment node
 *
 * PR41 — Tests for `inscribirseATaller` server action.
 *
 * Locks the auth_id → usuarios.id resolution contract. Before PR41, the
 * action passed `gate.userId` (the auth.uid) directly into
 * `taller_inscripciones.persona_principal_id`, but that FK points to
 * `public.usuarios.id` (the internal id), not `auth.users.id`. The
 * insert was rejected by FK enforcement (or by the RLS policy's own
 * subquery in the auto-enrollment path).
 *
 * Canonical pattern (already used in support.actions.ts:311,
 * solicitudes-grupo.actions.ts:167, support-capabilities.actions.ts:46):
 *
 *   const { data: usuario } = await supabase
 *     .from('usuarios')
 *     .select('id')
 *     .eq('auth_id', user.id)
 *     .maybeSingle()
 *
 * These tests assert:
 *   1. The action issues that exact lookup (table, columns, eq column,
 *      source value).
 *   2. The insert receives `persona_principal_id: usuario.id` (the
 *      INTERNAL id), NOT the auth uid.
 *   3. When the usuarios lookup returns null (no internal profile), the
 *      action returns `{ ok: false, error: 'internal' }` with a clear
 *      message — the participant is left without a 500 cliff.
 *   4. When the usuarios lookup returns an error, the action returns
 *      `{ ok: false, error: 'internal' }` with the underlying message.
 *
 * Mocks `@/lib/platform/talleres/api-helpers` (the gate) and
 * `@/lib/platform/talleres/flags`. The supabase client is exposed via
 * the gate's return value; per-table chains are stubbed so we can
 * inspect the final insert payload shape.
 */

import { inscribirseATaller } from '@/app/(auth)/talleres/explorar/actions'

jest.mock('@/lib/platform/talleres/flags', () => ({
  isTalleresEnabled: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/api-helpers', () => ({
  requireTalleresApi: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

const isTalleresEnabledMock = jest.requireMock('@/lib/platform/talleres/flags')
  .isTalleresEnabled as jest.Mock
const requireTalleresApiMock = jest.requireMock(
  '@/lib/platform/talleres/api-helpers',
).requireTalleresApi as jest.Mock
const revalidatePathMock = jest.requireMock('next/cache')
  .revalidatePath as jest.Mock

const AUTH_UID = 'auth-uid-1'
const USUARIO_INTERNAL_ID = 'usuario-internal-1'
const TALLER_ID = 'taller-edicion-1'
const COHORTE_ID = 'cohorte-1'

beforeEach(() => {
  isTalleresEnabledMock.mockReset().mockReturnValue(true)
  requireTalleresApiMock.mockReset()
  revalidatePathMock.mockReset()
})

// ─── 1) auth_id → usuarios.id resolution + 2) insert receives internal id ─

describe('inscribirseATaller — FK resolution contract', () => {
  it('resolves auth_id → internal usuarios.id and passes the internal id to the insert', async () => {
    // usuarios lookup chain: .from('usuarios').select('id').eq('auth_id', AUTH_UID).maybeSingle()
    const usuariosEq = jest.fn().mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: USUARIO_INTERNAL_ID },
        error: null,
      }),
    })
    const usuariosSelect = jest.fn().mockReturnValue({ eq: usuariosEq })
    const tallerInscripcionesInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: { id: 'inscripcion-1' },
          error: null,
        }),
      }),
    })

    // Build a supabase facade that records the 'taller_inscripciones' chain.
    const fromMock = jest.fn((table: string) => {
      if (table === 'usuarios') {
        return { select: usuariosSelect }
      }
      if (table === 'taller_inscripciones') {
        return { insert: tallerInscripcionesInsert }
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    requireTalleresApiMock.mockResolvedValue({
      ok: true,
      supabase: { from: fromMock },
      userId: AUTH_UID,
    })

    const result = await inscribirseATaller({
      tallerId: TALLER_ID,
      cohorteId: COHORTE_ID,
    })

    // ─── assertions ───
    expect(result).toEqual({ ok: true, inscripcionId: 'inscripcion-1' })

    // usuarios lookup contract
    expect(usuariosSelect).toHaveBeenCalledWith('id')
    expect(usuariosEq).toHaveBeenCalledWith('auth_id', AUTH_UID)

    // insert receives INTERNAL id, not auth uid
    expect(tallerInscripcionesInsert).toHaveBeenCalledTimes(1)
    const insertPayload = tallerInscripcionesInsert.mock.calls[0]![0]
    expect(insertPayload).toEqual({
      taller_id: TALLER_ID,
      cohorte_id: COHORTE_ID,
      persona_principal_id: USUARIO_INTERNAL_ID,
      companero_id: null,
      link_type: null,
      estado: 'pendiente',
    })
    // The auth uid must NEVER leak into the FK column.
    expect(insertPayload.persona_principal_id).not.toBe(AUTH_UID)
    expect(insertPayload.persona_principal_id).toBe(USUARIO_INTERNAL_ID)

    // revalidate the two lists so the participant sees the new row
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/explorar')
    expect(revalidatePathMock).toHaveBeenCalledWith('/talleres/mis-talleres')
  })

  it('passes through companeroId and linkType when the participant submits a paired inscription', async () => {
    // pareja workflow worth covering: companeroId + linkType are forwarded
    // into the insert payload. The RLS policy rejects self-enrolled
    // parejas (companero_id IS NULL is required), but the action layer
    // still forwards the values; the coordinator route is the canonical
    // path for couple inscriptions.
    const tallerInscripcionesInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: { id: 'inscripcion-2' },
          error: null,
        }),
      }),
    })

    const fromMock = jest.fn((table: string) => {
      if (table === 'usuarios') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: USUARIO_INTERNAL_ID },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'taller_inscripciones') {
        return { insert: tallerInscripcionesInsert }
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    requireTalleresApiMock.mockResolvedValue({
      ok: true,
      supabase: { from: fromMock },
      userId: AUTH_UID,
    })

    await inscribirseATaller({
      tallerId: TALLER_ID,
      cohorteId: COHORTE_ID,
      companeroId: 'companero-1',
      linkType: 'matrimonio',
    })

    const insertPayload = tallerInscripcionesInsert.mock.calls[0]![0]
    expect(insertPayload.companero_id).toBe('companero-1')
    expect(insertPayload.link_type).toBe('matrimonio')
  })
})

// ─── 3) usuario no encontrado → internal ─────────────────────────────────

describe('inscribirseATaller — error paths', () => {
  it('returns internal with a clear message when the usuarios lookup returns null', async () => {
    const tallerInscripcionesInsert = jest.fn()

    const fromMock = jest.fn((table: string) => {
      if (table === 'usuarios') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'taller_inscripciones') {
        return { insert: tallerInscripcionesInsert }
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    requireTalleresApiMock.mockResolvedValue({
      ok: true,
      supabase: { from: fromMock },
      userId: AUTH_UID,
    })

    const result = await inscribirseATaller({
      tallerId: TALLER_ID,
      cohorteId: COHORTE_ID,
    })

    expect(result).toEqual({
      ok: false,
      error: 'internal',
      message: 'usuario interno no encontrado para auth.uid',
    })
    // The taller_inscripciones insert must NEVER be attempted without a
    // resolved internal id — that path is the original FK bug.
    expect(tallerInscripcionesInsert).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('returns internal with the underlying message when the usuarios lookup errors', async () => {
    const tallerInscripcionesInsert = jest.fn()

    const fromMock = jest.fn((table: string) => {
      if (table === 'usuarios') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'connection refused' },
              }),
            }),
          }),
        }
      }
      if (table === 'taller_inscripciones') {
        return { insert: tallerInscripcionesInsert }
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    requireTalleresApiMock.mockResolvedValue({
      ok: true,
      supabase: { from: fromMock },
      userId: AUTH_UID,
    })

    const result = await inscribirseATaller({
      tallerId: TALLER_ID,
      cohorteId: COHORTE_ID,
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected ok:false')
    expect(result.error).toBe('internal')
    expect(result.message).toBe('resolve usuario: connection refused')
    expect(tallerInscripcionesInsert).not.toHaveBeenCalled()
  })

  it('returns internal when the insert itself fails after a successful resolution', async () => {
    // The usuario lookup succeeds, but the insert blows up (e.g. RLS
    // rejects, FK violation). The action must surface the underlying
    // error message rather than silently swallow it.
    const tallerInscripcionesInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'new row violates row-level security policy' },
        }),
      }),
    })

    const fromMock = jest.fn((table: string) => {
      if (table === 'usuarios') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: USUARIO_INTERNAL_ID },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'taller_inscripciones') {
        return { insert: tallerInscripcionesInsert }
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    requireTalleresApiMock.mockResolvedValue({
      ok: true,
      supabase: { from: fromMock },
      userId: AUTH_UID,
    })

    const result = await inscribirseATaller({
      tallerId: TALLER_ID,
      cohorteId: COHORTE_ID,
    })

    expect(result).toEqual({
      ok: false,
      error: 'internal',
      message: 'new row violates row-level security policy',
    })
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})
