/**
 * Server actions of /dream-team/dps/asistencia (odd/tasks/dps-asistencia-pco.md,
 * T9): they call the dps_asistencia_* RPCs with the session client, check the
 * input before calling, never revalidate (the client applies the marks in
 * place) and return the RPC errors in Spanish with their code.
 */
const rpc = jest.fn()
const getUser = jest.fn()
const revalidatePath = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, rpc }),
}))
jest.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }))

import { cargarPlanillaDps, marcarAsistenciaDps, marcarEquipoDps } from '@/lib/actions/dps-asistencia.actions'

const PLAN = '66666666-6666-4666-8666-666666666666'
const EQUIPO = '77777777-7777-4777-8777-777777777777'
const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const DATOS_INVALIDOS = { ok: false, message: 'Revisa los datos e inténtalo de nuevo.', codigo: null }

beforeEach(() => {
  rpc.mockReset()
  getUser.mockReset()
  revalidatePath.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('cargarPlanillaDps', () => {
  it('reads the sheet of the plan for every team the caller passes', async () => {
    rpc.mockResolvedValueOnce({
      data: { plan_id: PLAN, fecha: '2026-11-08', tipo: 'domingo', hoy: '2026-11-08', editable: true, equipos: [], totales: {} },
      error: null,
    })
    const r = await cargarPlanillaDps({ planId: PLAN })
    expect(rpc).toHaveBeenCalledWith('dps_asistencia_planilla', { p_plan_id: PLAN, p_equipo_id: null })
    expect(r).toMatchObject({ ok: true, data: { planId: PLAN, editable: true, equipos: [] } })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects a bad plan id before calling and asks to sign in again without a session', async () => {
    expect(await cargarPlanillaDps({ planId: 'x' })).toEqual(DATOS_INVALIDOS)
    getUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await cargarPlanillaDps({ planId: PLAN })).toEqual({ ok: false, message: 'Tu sesión terminó. Vuelve a iniciar sesión.', codigo: null })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('explains a caller without teams', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'sin_autoridad' } })
    expect(await cargarPlanillaDps({ planId: PLAN })).toEqual({
      ok: false,
      message: 'No tienes equipos para pasar asistencia en este plan.',
      codigo: 'sin_autoridad',
    })
  })
})

describe('marcarAsistenciaDps', () => {
  it('marks the people and returns how many changed', async () => {
    rpc.mockResolvedValueOnce({ data: { estado: 'llego', personas: 2, cambiados: 1 }, error: null })
    const r = await marcarAsistenciaDps({ planId: PLAN, personaIds: [P1, P2], estado: 'llego' })
    expect(rpc).toHaveBeenCalledWith('dps_asistencia_marcar', {
      p_plan_id: PLAN,
      p_persona_ids: [P1, P2],
      p_estado: 'llego',
      p_solo_sin_marcar: false,
    })
    expect(r).toEqual({ ok: true, data: { cambiados: 1 } })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('clears with a null estado and sends "avisó que no viene" as is', async () => {
    rpc.mockResolvedValue({ data: { cambiados: 1 }, error: null })
    await marcarAsistenciaDps({ planId: PLAN, personaIds: [P1], estado: null })
    await marcarAsistenciaDps({ planId: PLAN, personaIds: [P1], estado: 'aviso_no_viene' })
    expect(rpc.mock.calls.map((c) => c[1].p_estado)).toEqual([null, 'aviso_no_viene'])
  })

  it('rejects bad input before calling', async () => {
    expect(await marcarAsistenciaDps({ planId: PLAN, personaIds: [], estado: 'llego' })).toEqual(DATOS_INVALIDOS)
    expect(await marcarAsistenciaDps({ planId: PLAN, personaIds: ['x'], estado: 'llego' })).toEqual(DATOS_INVALIDOS)
    expect(await marcarAsistenciaDps({ planId: PLAN, personaIds: [P1], estado: 'presente' as never })).toEqual(DATOS_INVALIDOS)
    expect(await marcarAsistenciaDps({ planId: PLAN, personaIds: Array(301).fill(P1), estado: 'llego' })).toEqual({
      ok: false,
      message: 'Son demasiadas personas a la vez (máximo 300).',
      codigo: 'demasiados',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['sin_autoridad', '42501', 'No tienes permiso para pasar asistencia en este equipo.'],
    ['fecha_invalida', '22023', 'Solo se puede pasar asistencia el día del plan o hasta 14 días después.'],
    ['persona_invalida', '22023', 'Esa persona ya no está en este plan ni sirve en DPS. Actualiza la página.'],
    ['plan_invalido', '22023', 'Ese plan ya no existe. Actualiza la página.'],
  ])('returns %s in Spanish', async (codigo, code, message) => {
    rpc.mockResolvedValueOnce({ data: null, error: { code, message: codigo } })
    expect(await marcarAsistenciaDps({ planId: PLAN, personaIds: [P1], estado: 'llego' })).toEqual({ ok: false, message, codigo })
  })
})

describe('marcarEquipoDps', () => {
  it('marks every convocado of the team without a mark as arrived', async () => {
    rpc.mockResolvedValueOnce({ data: 4, error: null })
    expect(await marcarEquipoDps({ planId: PLAN, equipoId: EQUIPO })).toEqual({ ok: true, data: { cambiados: 4 } })
    expect(rpc).toHaveBeenCalledWith('dps_asistencia_marcar_equipo', { p_plan_id: PLAN, p_equipo_id: EQUIPO, p_estado: 'llego' })
  })

  it('rejects a bad team and explains an invalid one', async () => {
    expect(await marcarEquipoDps({ planId: PLAN, equipoId: 'x' })).toEqual(DATOS_INVALIDOS)
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'equipo_invalido' } })
    expect(await marcarEquipoDps({ planId: PLAN, equipoId: EQUIPO })).toEqual({
      ok: false,
      message: 'Ese equipo ya no está en DPS. Actualiza la página.',
      codigo: 'equipo_invalido',
    })
  })
})
