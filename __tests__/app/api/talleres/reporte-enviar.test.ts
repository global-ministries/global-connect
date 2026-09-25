/**
 * @jest-environment node
 *
 * T4 (odd/tasks/talleres-asistencia-lider.md) — POST
 * /api/talleres/grupos/[id]/reporte/enviar, the route behind the líder's
 * "Enviar reporte" button.
 *
 * Like T3's asistencia/cerrar routes, it is a THIN wrapper over T1's
 * SECURITY DEFINER function `talleres_enviar_reporte(p_grupo_id,
 * p_observaciones)`. The route
 *
 *   1. applies only the kill switch + session gate (no capability
 *      consultation — an assigned líder holding ZERO talleres capabilities
 *      must be able to send, criterio 7; the function decides, same
 *      conclusion T3 reached for cerrar/asistencia);
 *   2. forwards the optional observaciones and never touches
 *      taller_reportes itself (the reporte CREATION path is untouched);
 *   3. translates every refusal the function (or taller_reportes_lock_
 *      after_send) raises into an HTTP status + a Spanish message.
 *
 * The signature is NEVER taken from the body: talleres_enviar_reporte
 * signs with auth.uid() (criterio 3 — the líder signs their own send), so
 * the old `firma_lider_persona_id` body field is gone.
 *
 * Asserted invariants:
 *   - zero direct writes: `from()` is never called, only the RPC;
 *   - an already-`enviado` reporte answers 409 with Spanish copy instead
 *     of a raw trigger message (the screen must not break);
 *   - revalidatePath() fires on success so the grupo screen flips to
 *     `enviado` at once.
 */

import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'

import { POST as enviarReporte } from '@/app/api/talleres/grupos/[id]/reporte/enviar/route'

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

function grupoCtx(id = 'g-1') {
  return { params: Promise.resolve({ id }) }
}

function enviarReq(body?: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost/api/talleres/grupos/g-1/reporte/enviar'), {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  })
}

const GRUPO_RUTA = '/talleres/[taller]/[edicion]/[grupo]'

// ─── Portón ────────────────────────────────────────────────────────────────

describe('POST reporte/enviar — portón (kill switch + sesión)', () => {
  it('returns 404 when the talleres flag is off', async () => {
    flagsMock.mockReturnValue(false)
    const res = await enviarReporte(enviarReq(), grupoCtx())
    expect(res.status).toBe(404)
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('returns 401 when there is no authed user', async () => {
    state.user = null
    const res = await enviarReporte(enviarReq(), grupoCtx())
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('unauthorized')
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('lets a líder with ZERO capabilities reach talleres_enviar_reporte', async () => {
    // Criterio 7: the assigned líder with no capability must be able to
    // send. The capability RPC is never consulted — the function decides.
    state.rpcResult = { data: { reporte_id: 'r-1', estado: 'enviado' }, error: null }
    const res = await enviarReporte(enviarReq(), grupoCtx())
    expect(res.status).toBe(200)
    expect(state.rpcCalls).toHaveLength(1)
    expect(state.rpcCalls[0].name).toBe('talleres_enviar_reporte')
    expect(state.rpcCalls[0].args).toEqual({ p_grupo_id: 'g-1', p_observaciones: null })
  })
})

// ─── Traducción de errores ─────────────────────────────────────────────────

describe('POST reporte/enviar — traduce los errores de la función a HTTP + español', () => {
  it.each([
    {
      mensaje: 'sin_permisos_para_este_grupo',
      code: '42501',
      status: 403,
      mensajeEs: 'No tenés permisos para este grupo.',
    },
    {
      mensaje: 'solo_el_lider_puede_enviar_el_reporte',
      code: '42501',
      status: 403,
      mensajeEs: 'Sólo el líder de este grupo puede enviar el reporte.',
    },
    {
      mensaje: 'CLASES_ABIERTAS',
      code: 'P0001',
      status: 409,
      mensajeEs: 'Hay clases todavía abiertas; cerralas antes de enviar el reporte.',
    },
    {
      mensaje: 'REPORTE_NO_ENCONTRADO',
      code: 'P0001',
      status: 404,
      mensajeEs: 'No existe ese reporte.',
    },
    {
      // taller_reportes_lock_after_send Rule 1 — a second send.
      mensaje: 'taller_reportes locked: enviado can only transition to reabierto or cerrado (got enviado)',
      code: '23514',
      status: 409,
      mensajeEs: 'Este reporte ya fue enviado.',
    },
    {
      mensaje: 'un error que nadie conoce',
      code: 'XX000',
      status: 500,
      mensajeEs: 'No se pudo enviar el reporte.',
    },
  ])('$mensaje ($code) → $status', async ({ mensaje, code, status, mensajeEs }) => {
    falla(mensaje, code)
    const res = await enviarReporte(enviarReq(), grupoCtx())
    expect(res.status).toBe(status)
    const body = (await res.json()) as { error: string; message: string }
    expect(body.message).toBe(mensajeEs)
  })

  it('never leaks the raw SQLSTATE or the RAISE text to the user', async () => {
    falla('sin_permisos_para_este_grupo', '42501')
    const res = await enviarReporte(enviarReq(), grupoCtx())
    const body = (await res.json()) as { error: string; message: string }
    expect(body.error).toBe('forbidden')
    expect(JSON.stringify(body)).not.toContain('42501')
    expect(JSON.stringify(body)).not.toContain('sin_permisos')
  })

  it('does not break on an already-sent reporte: 409 + Spanish copy', async () => {
    falla(
      'taller_reportes locked: enviado can only transition to reabierto or cerrado (got enviado)',
      '23514',
    )
    const res = await enviarReporte(enviarReq(), grupoCtx())
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string; message: string }
    expect(body).toEqual({ error: 'conflict', message: 'Este reporte ya fue enviado.' })
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

// ─── Cuerpo ────────────────────────────────────────────────────────────────

describe('POST reporte/enviar — cuerpo', () => {
  it('accepts a request with no body at all (the button sends none)', async () => {
    state.rpcResult = { data: { reporte_id: 'r-1', estado: 'enviado' }, error: null }
    const res = await enviarReporte(enviarReq(), grupoCtx())
    expect(res.status).toBe(200)
    expect(state.rpcCalls[0].args).toEqual({ p_grupo_id: 'g-1', p_observaciones: null })
  })

  it('forwards observaciones when the caller sends them', async () => {
    state.rpcResult = { data: { reporte_id: 'r-1', estado: 'enviado' }, error: null }
    const res = await enviarReporte(enviarReq({ observaciones: 'Cerramos bien el ciclo.' }), grupoCtx())
    expect(res.status).toBe(200)
    expect(state.rpcCalls[0].args).toEqual({
      p_grupo_id: 'g-1',
      p_observaciones: 'Cerramos bien el ciclo.',
    })
  })

  it('ignores a non-string observaciones instead of sending junk to the function', async () => {
    state.rpcResult = { data: { reporte_id: 'r-1', estado: 'enviado' }, error: null }
    const res = await enviarReporte(enviarReq({ observaciones: 42 }), grupoCtx())
    expect(res.status).toBe(200)
    expect(state.rpcCalls[0].args).toEqual({ p_grupo_id: 'g-1', p_observaciones: null })
  })

  it('never accepts a caller-supplied firma (the function signs with auth.uid())', async () => {
    state.rpcResult = { data: { reporte_id: 'r-1', estado: 'enviado' }, error: null }
    const res = await enviarReporte(
      enviarReq({ firma_lider_persona_id: 'otra-persona' }),
      grupoCtx(),
    )
    expect(res.status).toBe(200)
    expect(state.rpcCalls[0].args).toEqual({ p_grupo_id: 'g-1', p_observaciones: null })
    expect(JSON.stringify(state.rpcCalls[0].args)).not.toContain('firma_lider')
  })
})

// ─── Invariantes ───────────────────────────────────────────────────────────

describe('POST reporte/enviar — delega por completo en la función', () => {
  it('never touches taller_reportes directly (sin from(), sin update())', async () => {
    state.rpcResult = { data: { reporte_id: 'r-1', estado: 'enviado' }, error: null }
    const res = await enviarReporte(enviarReq(), grupoCtx())
    expect(res.status).toBe(200)
    expect(state.fromCalls).toBe(0)
  })

  it('revalidates the grupo screen and returns the function result on success', async () => {
    state.rpcResult = { data: { reporte_id: 'r-1', estado: 'enviado' }, error: null }
    const res = await enviarReporte(enviarReq(), grupoCtx())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ reporte_id: 'r-1', estado: 'enviado' })
    expect(revalidatePathMock).toHaveBeenCalledWith(GRUPO_RUTA, 'page')
  })
})
