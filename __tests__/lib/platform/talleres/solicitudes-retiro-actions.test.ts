/**
 * @jest-environment node
 *
 * Server actions for the coordinator/dirección "resolver solicitud de
 * retiro" surfaces. Unlike the inscripciones actions (which UPDATE the
 * row directly), these delegate the whole transaction to the
 * SECURITY DEFINER RPC `talleres_resolver_solicitud_retiro`, which:
 *   - derives the reviewer + scope gate from auth.uid() (NO caller id),
 *   - executes the REAL withdrawal on approve (participante → inscripción
 *     'retirado'; equipo → asignación desactivada),
 *   - only closes the request on reject (estado 'rechazada', no delete).
 *
 * The RPC is the security wall (auth_has_talleres_capability_scoped), so
 * the app-layer gate here is intentionally thin: empty-id guard → flag →
 * auth → RPC. Authorization (coordinator scoped to their equipo) lives
 * in the RPC and surfaces to the app as SQLSTATE 42501.
 *
 * Error-code mapping (verified against the live staging function def):
 *   42501 → FORBIDDEN                     (usuario_no_encontrado / sin_permisos)
 *   P0002 → NOT_FOUND_OR_NOT_PENDIENTE    (no existe o ya procesada)
 *   22023 → INVALID_ACCION                (accion_invalida / tipo_desconocido)
 *   22004 → MISSING_TARGET                (participante sin inscripción / equipo sin asignación)
 *   else  → RESOLVE_FAILED                (unknown — surface the sql message)
 */

import { revalidatePath } from 'next/cache'

import {
  aprobarSolicitudRetiroAction,
  rechazarSolicitudRetiroAction,
} from '@/lib/platform/talleres/solicitudes-retiro-actions'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { createSupabaseServerClient } from '@/lib/supabase/server'

jest.mock('@/lib/platform/talleres/flags', () => ({
  isTalleresEnabled: jest.fn(),
}))
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

const mockIsTalleresEnabled = isTalleresEnabled as jest.MockedFunction<
  typeof isTalleresEnabled
>
const mockCreateClient = createSupabaseServerClient as jest.MockedFunction<
  typeof createSupabaseServerClient
>
const mockRevalidatePath = revalidatePath as jest.MockedFunction<
  typeof revalidatePath
>

const AUTH_UID = 'auth-uid-1'
const SOLICITUD_ID = 'sol-1'

const REVALIDATED_SURFACES = [
  '/talleres/coordinacion/solicitudes',
  '/talleres/direccion/solicitudes',
  '/talleres/coordinacion',
]

interface SetupOptions {
  readonly flagEnabled?: boolean
  readonly user?: { id: string } | null
  readonly rpcData?: unknown
  readonly rpcError?: { code?: string; message?: string } | null
}

function setupMocks({
  flagEnabled = true,
  user = { id: AUTH_UID },
  rpcData = { ok: true, accion: 'aprobar' },
  rpcError = null,
}: SetupOptions = {}) {
  mockIsTalleresEnabled.mockReturnValue(flagEnabled)

  const rpc = jest.fn().mockResolvedValue({ data: rpcData, error: rpcError })
  const getUser = jest
    .fn()
    .mockResolvedValue({ data: { user }, error: null })

  const client = {
    auth: { getUser },
    rpc,
  }

  mockCreateClient.mockResolvedValue(client as never)

  return { client, rpc, getUser }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('solicitudes-retiro-actions — reusability', () => {
  it('exports both aprobar + rechazar server actions as functions', () => {
    expect(typeof aprobarSolicitudRetiroAction).toBe('function')
    expect(typeof rechazarSolicitudRetiroAction).toBe('function')
  })
})

describe('aprobarSolicitudRetiroAction — happy path', () => {
  it('calls the RPC with p_accion=aprobar and null motivo, then revalidates', async () => {
    const { rpc } = setupMocks({ rpcData: { ok: true, accion: 'aprobar' } })

    const result = await aprobarSolicitudRetiroAction(SOLICITUD_ID)

    expect(result.ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith('talleres_resolver_solicitud_retiro', {
      p_solicitud_id: SOLICITUD_ID,
      p_accion: 'aprobar',
      p_motivo: null,
    })
    for (const surface of REVALIDATED_SURFACES) {
      expect(mockRevalidatePath).toHaveBeenCalledWith(surface)
    }
  })
})

describe('rechazarSolicitudRetiroAction — happy path', () => {
  it('calls the RPC with p_accion=rechazar and null motivo, then revalidates', async () => {
    const { rpc } = setupMocks({ rpcData: { ok: true, accion: 'rechazar' } })

    const result = await rechazarSolicitudRetiroAction(SOLICITUD_ID)

    expect(result.ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith('talleres_resolver_solicitud_retiro', {
      p_solicitud_id: SOLICITUD_ID,
      p_accion: 'rechazar',
      p_motivo: null,
    })
    for (const surface of REVALIDATED_SURFACES) {
      expect(mockRevalidatePath).toHaveBeenCalledWith(surface)
    }
  })
})

describe('solicitudes-retiro-actions — gate', () => {
  it('returns talleres-disabled and never calls the RPC when the flag is off', async () => {
    const { rpc } = setupMocks({ flagEnabled: false })

    const result = await aprobarSolicitudRetiroAction(SOLICITUD_ID)

    expect(result).toEqual({ ok: false, error: 'talleres-disabled' })
    expect(rpc).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('returns UNAUTHENTICATED and never calls the RPC when there is no user', async () => {
    const { rpc } = setupMocks({ user: null })

    const result = await aprobarSolicitudRetiroAction(SOLICITUD_ID)

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
    expect(rpc).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('guards an empty solicitud id before consulting the flag', async () => {
    const { rpc } = setupMocks()

    const result = await aprobarSolicitudRetiroAction('')

    expect(result).toEqual({ ok: false, error: 'NOT_FOUND_OR_NOT_PENDIENTE' })
    expect(mockIsTalleresEnabled).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('solicitudes-retiro-actions — RPC error mapping', () => {
  it('maps 42501 → FORBIDDEN', async () => {
    setupMocks({ rpcData: null, rpcError: { code: '42501', message: 'sin_permisos_para_esta_solicitud' } })

    const result = await aprobarSolicitudRetiroAction(SOLICITUD_ID)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('FORBIDDEN')
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('maps P0002 → NOT_FOUND_OR_NOT_PENDIENTE', async () => {
    setupMocks({ rpcData: null, rpcError: { code: 'P0002', message: 'solicitud_no_encontrada_o_procesada' } })

    const result = await rechazarSolicitudRetiroAction(SOLICITUD_ID)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('NOT_FOUND_OR_NOT_PENDIENTE')
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('maps 22023 → INVALID_ACCION', async () => {
    setupMocks({ rpcData: null, rpcError: { code: '22023', message: 'accion_invalida' } })

    const result = await aprobarSolicitudRetiroAction(SOLICITUD_ID)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('INVALID_ACCION')
  })

  it('maps 22004 → MISSING_TARGET', async () => {
    setupMocks({ rpcData: null, rpcError: { code: '22004', message: 'solicitud_participante_sin_inscripcion' } })

    const result = await aprobarSolicitudRetiroAction(SOLICITUD_ID)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('MISSING_TARGET')
  })

  it('maps an unknown SQLSTATE → RESOLVE_FAILED and surfaces the sql message', async () => {
    setupMocks({ rpcData: null, rpcError: { code: '23505', message: 'boom' } })

    const result = await aprobarSolicitudRetiroAction(SOLICITUD_ID)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('RESOLVE_FAILED')
    expect(result.message).toContain('boom')
  })
})
