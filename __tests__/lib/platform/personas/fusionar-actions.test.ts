/**
 * @jest-environment node
 *
 * Personas — server actions of /admin/personas/fusionar (T5, S6c): session
 * gate, input validation, the RPC calls (personas_fusion_buscar,
 * personas_fusion_resumen, personas_fusionar with p_simular) and the error
 * mapping. Who may merge is decided by the database (admin/pastor, 42501).
 */
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))

import {
  buscarPersonasParaFusion,
  fusionarPersonas,
  resumenFusion,
} from '@/lib/actions/personas-fusionar.actions'

const crearCliente = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

let rpc: jest.Mock

function cliente({ user = { id: 'auth-1' } as { id: string } | null, data = null as unknown, error = null as unknown } = {}) {
  rpc = jest.fn().mockResolvedValue({ data, error })
  crearCliente.mockReset().mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user } }) },
    rpc,
  })
}

describe('buscarPersonasParaFusion', () => {
  it('without a session answers the session message and calls nothing', async () => {
    cliente({ user: null })
    expect(await buscarPersonasParaFusion('ana')).toEqual({ ok: false, error: 'Tu sesión terminó. Vuelve a iniciar sesión.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('fewer than 2 characters answer an empty list without calling the RPC', async () => {
    cliente()
    expect(await buscarPersonasParaFusion(' a ')).toEqual({ ok: true, data: [] })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('calls personas_fusion_buscar with the trimmed text and maps the rows', async () => {
    cliente({ data: [{ id: A, nombre: 'Ana', apellido: 'Pérez', email: null, tiene_cuenta: false }] })
    expect(await buscarPersonasParaFusion('  ana pérez ')).toEqual({
      ok: true,
      data: [{ id: A, nombre: 'Ana', apellido: 'Pérez', email: null, tieneCuenta: false }],
    })
    expect(rpc).toHaveBeenCalledWith('personas_fusion_buscar', { p_q: 'ana pérez' })
  })

  it('maps a 42501 to the permission message', async () => {
    cliente({ error: { code: '42501', message: 'sin_autoridad' } })
    expect(await buscarPersonasParaFusion('ana')).toEqual({ ok: false, error: 'No tienes permiso para fusionar personas.' })
  })
})

describe('resumenFusion', () => {
  it('refuses anything but two different uuids without calling the RPC', async () => {
    cliente()
    expect(await resumenFusion([A, A])).toEqual({ ok: false, error: 'Elige dos fichas distintas.' })
    expect(await resumenFusion([A, 'x'])).toEqual({ ok: false, error: 'Elige dos fichas distintas.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('calls personas_fusion_resumen with both ids', async () => {
    cliente({ data: [] })
    expect(await resumenFusion([A, B])).toEqual({ ok: true, data: [] })
    expect(rpc).toHaveBeenCalledWith('personas_fusion_resumen', { p_ids: [A, B] })
  })
})

describe('fusionarPersonas', () => {
  const respuesta = {
    simulado: true,
    queda_id: A,
    se_va_id: B,
    conteos: { 'grupo_miembros.usuario_id': { movidos: 1, descartados: 0 } },
    total_movidos: 1,
    total_descartados: 0,
    campos_completados: [],
  }

  it('runs the dry run with p_simular true and maps the answer', async () => {
    cliente({ data: respuesta })
    const r = await fusionarPersonas({ quedaId: A, seVaId: B, simular: true })
    expect(rpc).toHaveBeenCalledWith('personas_fusionar', { p_queda: A, p_se_va: B, p_simular: true })
    expect(r).toEqual({
      ok: true,
      data: {
        simulado: true,
        quedaId: A,
        seVaId: B,
        conteos: [{ clave: 'grupo_miembros.usuario_id', etiqueta: 'Grupos de vida', movidos: 1, descartados: 0, retirados: 0, conservados: 0 }],
        totalMovidos: 1,
        totalDescartados: 0,
        totalConservados: 0,
        camposCompletados: [],
      },
    })
  })

  it('runs the real merge with p_simular false', async () => {
    cliente({ data: { ...respuesta, simulado: false } })
    const r = await fusionarPersonas({ quedaId: A, seVaId: B, simular: false })
    expect(rpc).toHaveBeenCalledWith('personas_fusionar', { p_queda: A, p_se_va: B, p_simular: false })
    expect(r.ok && r.data.simulado).toBe(false)
  })

  it('refuses invalid ids without calling the RPC', async () => {
    cliente()
    expect(await fusionarPersonas({ quedaId: 'x', seVaId: B, simular: true })).toEqual({ ok: false, error: 'Elige dos fichas distintas.' })
    expect(await fusionarPersonas({ quedaId: A, seVaId: A, simular: true })).toEqual({ ok: false, error: 'Elige dos fichas distintas.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps the database refusals', async () => {
    cliente({ error: { code: '22023', message: 'ambas_con_cuenta' } })
    expect(await fusionarPersonas({ quedaId: A, seVaId: B, simular: false })).toEqual({
      ok: false,
      error: 'Las dos fichas tienen cuenta. No se pueden fusionar.',
    })
  })

  // T7 (B1): the refusal of a collision only a human settles reaches the screen naming the area.
  it('maps fusion_conflicto with the table in details to its area, on the dry run too', async () => {
    cliente({ error: { code: '22023', message: 'fusion_conflicto', details: 'taller_inscripciones', hint: null } })
    expect(await fusionarPersonas({ quedaId: A, seVaId: B, simular: true })).toEqual({
      ok: false,
      error:
        'Las dos fichas están inscritas en la misma edición de un taller y una de esas inscripciones es en pareja. No se cambió nada; retira una de las dos inscripciones en Talleres y vuelve a intentarlo.',
    })
    cliente({ error: { code: '22023', message: 'fusion_conflicto', details: 'casas_anfitrionas', hint: null } })
    expect(await fusionarPersonas({ quedaId: A, seVaId: B, simular: false })).toEqual({
      ok: false,
      error:
        'Las dos fichas tienen una casa anfitriona y cada persona solo puede tener una. No se cambió nada; deja una sola casa en Casas anfitrionas y vuelve a intentarlo.',
    })
  })

  it('never leaks an unexpected database error', async () => {
    cliente({ error: { code: '23503', message: 'update or delete on table "usuarios" violates foreign key constraint' } })
    const consola = jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(await fusionarPersonas({ quedaId: A, seVaId: B, simular: false })).toEqual({
      ok: false,
      error: 'No se pudo fusionar. No se cambió nada; intenta de nuevo o avisa a soporte.',
    })
    consola.mockRestore()
  })
})
