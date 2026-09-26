/**
 * @jest-environment node
 *
 * T3 (odd/tasks/talleres-asistencia-lider.md) — the two write routes the
 * register form and the "Cerrar clase" action hit. Both are thin wrappers
 * around T1's SECURITY DEFINER functions:
 *
 *   POST /api/talleres/sesiones/[id]/asistencia → talleres_registrar_asistencia
 *   POST /api/talleres/sesiones/[id]/cerrar     → talleres_cerrar_clase
 *
 * The DB is the authorization authority (the same conclusion as the
 * reporte/enviar route in docs/talleres-de-punta-a-punta.md): the gate here
 * only applies the kill switch and an authenticated session, so an assigned
 * líder holding ZERO talleres capabilities still reaches the function.
 * Everything the function refuses (42501 / P0001) is translated into a
 * Spanish, user-facing message with the right HTTP status.
 *
 * Asserted invariants:
 *   - the routes never touch taller_asistencias/taller_sesiones directly —
 *     `from()` is never called, only the RPC;
 *   - a malformed body is rejected BEFORE the function runs;
 *   - revalidatePath() fires on success so the grupo screen is fresh.
 */

import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'

import { POST as registrarAsistencia } from '@/app/api/talleres/sesiones/[id]/asistencia/route'
import { POST as cerrarClase } from '@/app/api/talleres/sesiones/[id]/cerrar/route'

jest.mock('@/lib/platform/talleres/flags', () => ({
  isTalleresEnabled: jest.fn(() => true),
}))

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags')
  .isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const revalidatePathMock = revalidatePath as jest.Mock

interface RpcResult {
  readonly data: unknown
  readonly error: { readonly message: string; readonly code?: string } | null
}

const state = {
  user: { id: 'user-1' } as { id: string } | null,
  rpcResult: { data: null, error: null } as RpcResult,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  fromCalls: 0,
}

function reset() {
  state.user = { id: 'user-1' }
  state.rpcResult = { data: null, error: null }
  state.rpcCalls = []
  state.fromCalls = 0
}

/** Make the next RPC call fail the way PostgREST reports a RAISE EXCEPTION. */
function falla(mensaje: string, code = 'P0001'): void {
  state.rpcResult = { data: null, error: { message: mensaje, code } }
}

beforeEach(() => {
  reset()
  jest.clearAllMocks()
  flagsMock.mockReset().mockReturnValue(true)

  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockImplementation(() =>
        Promise.resolve({ data: { user: state.user }, error: null }),
      ),
    },
    rpc: jest.fn((name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args })
      return Promise.resolve(state.rpcResult)
    }),
    from: jest.fn(() => {
      state.fromCalls++
      return {}
    }),
  })
})

function sesionCtx(id = 's-1') {
  return { params: Promise.resolve({ id }) }
}

function asistenciaReq(body: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost/api/talleres/sesiones/s-1/asistencia'), {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function cerrarReq(): NextRequest {
  return new NextRequest(new URL('http://localhost/api/talleres/sesiones/s-1/cerrar'), {
    method: 'POST',
  })
}

const MARCAS = [
  { inscripcion_id: 'i-1', estado: 'presente' },
  { inscripcion_id: 'i-2', estado: 'ausente', motivo: 'Viaje de trabajo' },
]

const GRUPO_RUTA = '/talleres/[taller]/[edicion]/[grupo]'

// ─── Portón ────────────────────────────────────────────────────────────────

describe('POST asistencia/cerrar — portón (kill switch + sesión)', () => {
  it('returns 404 when the talleres flag is off', async () => {
    flagsMock.mockReturnValue(false)
    const res = await registrarAsistencia(asistenciaReq({ marcas: MARCAS }), sesionCtx())
    expect(res.status).toBe(404)
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('returns 401 when there is no authed user', async () => {
    state.user = null
    const res = await registrarAsistencia(asistenciaReq({ marcas: MARCAS }), sesionCtx())
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('unauthorized')
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('returns 401 on cerrar too', async () => {
    state.user = null
    const res = await cerrarClase(cerrarReq(), sesionCtx())
    expect(res.status).toBe(401)
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('lets a caller with ZERO capabilities reach talleres_registrar_asistencia', async () => {
    // Criterio 1: "un líder asignado (sin capacidades) pasa lista". The
    // capability RPC is never consulted — the function decides.
    state.rpcResult = { data: { presentes: 1, ausentes: 1, total: 2 }, error: null }
    const res = await registrarAsistencia(asistenciaReq({ marcas: MARCAS }), sesionCtx())
    expect(res.status).toBe(201)
    expect(state.rpcCalls).toHaveLength(1)
    expect(state.rpcCalls[0].name).toBe('talleres_registrar_asistencia')
    expect(state.rpcCalls[0].args).toEqual({ p_sesion_id: 's-1', p_marcas: MARCAS })
  })
})

// ─── Traducción de errores ─────────────────────────────────────────────────

describe('POST asistencia — traduce los errores de la función a HTTP + español', () => {
  it.each([
    { mensaje: 'sin_permisos_para_este_grupo', code: '42501', status: 403, mensajeEs: 'No tenés permisos para este grupo.' },
    { mensaje: 'SESION_NO_ENCONTRADA', code: 'P0001', status: 404, mensajeEs: 'No existe esa clase.' },
    { mensaje: 'CLASE_CERRADA', code: 'P0001', status: 409, mensajeEs: 'Esta clase ya está cerrada; no admite cambios.' },
    { mensaje: 'MARCAS_INVALIDAS', code: 'P0001', status: 400, mensajeEs: 'La lista de marcas no es válida.' },
    { mensaje: 'INSCRIPCION_NO_ENCONTRADA', code: 'P0001', status: 404, mensajeEs: 'No existe esa inscripción.' },
    { mensaje: 'INSCRIPCION_NO_EN_GRUPO', code: 'P0001', status: 409, mensajeEs: 'Esa inscripción no pertenece a este grupo.' },
    { mensaje: 'INSCRIPCION_NO_APROBADA', code: 'P0001', status: 409, mensajeEs: 'Esa inscripción no está aprobada.' },
    { mensaje: 'un error que nadie conoce', code: 'XX000', status: 500, mensajeEs: 'No se pudo guardar la asistencia.' },
  ])('$mensaje ($code) → $status', async ({ mensaje, code, status, mensajeEs }) => {
    falla(mensaje, code)
    const res = await registrarAsistencia(asistenciaReq({ marcas: MARCAS }), sesionCtx())
    expect(res.status).toBe(status)
    const body = (await res.json()) as { error: string; message: string }
    expect(body.message).toBe(mensajeEs)
  })

  it('never leaks the raw SQLSTATE or the RAISE text to the user', async () => {
    falla('sin_permisos_para_este_grupo', '42501')
    const res = await registrarAsistencia(asistenciaReq({ marcas: MARCAS }), sesionCtx())
    const body = (await res.json()) as { error: string; message: string }
    expect(body.error).toBe('forbidden')
    expect(JSON.stringify(body)).not.toContain('42501')
    expect(JSON.stringify(body)).not.toContain('sin_permisos')
  })
})

describe('POST cerrar — traduce los errores de la función a HTTP + español', () => {
  it.each([
    { mensaje: 'sin_permisos_para_este_grupo', code: '42501', status: 403, mensajeEs: 'No tenés permisos para este grupo.' },
    { mensaje: 'solo_el_lider_puede_cerrar_la_clase', code: '42501', status: 403, mensajeEs: 'Sólo el líder de este grupo puede cerrar la clase.' },
    { mensaje: 'SESION_NO_ENCONTRADA', code: 'P0001', status: 404, mensajeEs: 'No existe esa clase.' },
  ])('$mensaje ($code) → $status', async ({ mensaje, code, status, mensajeEs }) => {
    falla(mensaje, code)
    const res = await cerrarClase(cerrarReq(), sesionCtx())
    expect(res.status).toBe(status)
    expect(((await res.json()) as { message: string }).message).toBe(mensajeEs)
  })

  it('closes the clase and revalidates the grupo screen', async () => {
    state.rpcResult = { data: { sesion_id: 's-1', estado: 'cerrada' }, error: null }
    const res = await cerrarClase(cerrarReq(), sesionCtx())
    expect(res.status).toBe(200)
    expect(state.rpcCalls[0]).toEqual({
      name: 'talleres_cerrar_clase',
      args: { p_sesion_id: 's-1' },
    })
    expect(revalidatePathMock).toHaveBeenCalledWith(GRUPO_RUTA, 'page')
  })
})

// ─── Cuerpo ────────────────────────────────────────────────────────────────

describe('POST asistencia — validación del cuerpo antes de llamar a la función', () => {
  it('rejects a body without marcas and never calls the RPC', async () => {
    const res = await registrarAsistencia(asistenciaReq({}), sesionCtx())
    expect(res.status).toBe(400)
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('rejects an empty batch', async () => {
    const res = await registrarAsistencia(asistenciaReq({ marcas: [] }), sesionCtx())
    expect(res.status).toBe(400)
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('rejects a marca whose estado is not presente/ausente', async () => {
    const res = await registrarAsistencia(
      asistenciaReq({ marcas: [{ inscripcion_id: 'i-1', estado: 'no_aplica' }] }),
      sesionCtx(),
    )
    expect(res.status).toBe(400)
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('rejects a marca without inscripcion_id', async () => {
    const res = await registrarAsistencia(
      asistenciaReq({ marcas: [{ estado: 'presente' }] }),
      sesionCtx(),
    )
    expect(res.status).toBe(400)
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('rejects an unparseable body', async () => {
    const broken = new NextRequest(
      new URL('http://localhost/api/talleres/sesiones/s-1/asistencia'),
      { method: 'POST', body: 'not-json' },
    )
    const res = await registrarAsistencia(broken, sesionCtx())
    expect(res.status).toBe(400)
    expect(state.rpcCalls).toHaveLength(0)
  })
})

// ─── Invariantes ───────────────────────────────────────────────────────────

describe('POST asistencia — delega por completo en la función', () => {
  it('never touches taller_asistencias directly (sin from(), sin update(), sin delete())', async () => {
    state.rpcResult = { data: { presentes: 1, ausentes: 1, total: 2 }, error: null }
    const res = await registrarAsistencia(asistenciaReq({ marcas: MARCAS }), sesionCtx())
    expect(res.status).toBe(201)
    expect(state.fromCalls).toBe(0)
  })

  it('revalidates the grupo screen and returns the counters on success', async () => {
    state.rpcResult = { data: { presentes: 1, ausentes: 1, total: 2 }, error: null }
    const res = await registrarAsistencia(asistenciaReq({ marcas: MARCAS }), sesionCtx())
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ presentes: 1, ausentes: 1, total: 2 })
    expect(revalidatePathMock).toHaveBeenCalledWith(GRUPO_RUTA, 'page')
  })
})
