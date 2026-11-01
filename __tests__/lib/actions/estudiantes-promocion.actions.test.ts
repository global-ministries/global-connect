/**
 * Server action of /estudiantes/promocion (C6b3): it checks the campus and
 * the decisions before calling estudiantes_promocion_aplicar with the session
 * client, revalidates the promotion and Grupos pages only when it worked, and
 * returns the RPC errors in Spanish.
 */
const rpc = jest.fn()
const getUser = jest.fn()
const revalidatePath = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, rpc }),
}))
jest.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }))

import { aplicarPromocion } from '@/lib/actions/estudiantes-promocion.actions'

const CAMPUS = 'd0000000-0000-4000-8000-000000000001'
const G1 = 'c0000000-0000-4000-8000-000000000003'
const G2 = 'c0000000-0000-4000-8000-000000000007'
const DATOS_INVALIDOS = 'Revisa los datos e inténtalo de nuevo.'

beforeEach(() => {
  rpc.mockReset()
  getUser.mockReset()
  revalidatePath.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('aplicarPromocion', () => {
  it('applies the promotion with one decision per 3er año group and revalidates both pages', async () => {
    rpc.mockResolvedValueOnce({
      data: { campus_id: CAMPUS, grupos: 5, egresan: 4, fichas_suben: 30, grupos_nuevos: [{ grupo_id: 'n1', nombre: '4to año · Chicas B' }], pasan_grupo: [], aplicada_at: '2026-11-01T14:42:00+00:00', proxima: '2027-04-30' },
      error: null,
    })
    const r = await aplicarPromocion({ campusId: CAMPUS, decisiones: { [G1]: 'pasan_chicos', [G2]: 'pasa_grupo' } })
    expect(rpc).toHaveBeenCalledWith('estudiantes_promocion_aplicar', { p_campus_id: CAMPUS, p_decisiones: { [G1]: 'pasan_chicos', [G2]: 'pasa_grupo' } })
    expect(r).toEqual({
      ok: true,
      data: expect.objectContaining({ grupos: 5, egresan: 4, fichasSuben: 30, gruposNuevos: ['4to año · Chicas B'], proxima: '2027-04-30' }),
    })
    expect(revalidatePath).toHaveBeenCalledWith('/estudiantes/promocion')
    expect(revalidatePath).toHaveBeenCalledWith('/estudiantes/grupos')
  })

  it('accepts a campus without 3er año groups (no decisions)', async () => {
    rpc.mockResolvedValueOnce({ data: { grupos: 2, egresan: 0 }, error: null })
    expect(await aplicarPromocion({ campusId: CAMPUS, decisiones: {} })).toMatchObject({ ok: true })
    expect(rpc).toHaveBeenCalledWith('estudiantes_promocion_aplicar', { p_campus_id: CAMPUS, p_decisiones: {} })
  })

  it.each([
    ['a bad campus', { campusId: 'x', decisiones: {} }],
    ['a bad group id', { campusId: CAMPUS, decisiones: { 'no-uuid': 'pasa_grupo' } }],
    ['a bad decision', { campusId: CAMPUS, decisiones: { [G1]: 'quedarse' } }],
    ['decisions that are not an object', { campusId: CAMPUS, decisiones: [G1] }],
    ['no decisions', { campusId: CAMPUS, decisiones: null }],
  ])('rejects %s before calling', async (_caso, input) => {
    expect(await aplicarPromocion(input as never)).toEqual({ ok: false, message: DATOS_INVALIDOS })
    expect(rpc).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('asks to sign in again without a session', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await aplicarPromocion({ campusId: CAMPUS, decisiones: {} })).toEqual({ ok: false, message: 'Tu sesión terminó. Vuelve a iniciar sesión.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    [{ code: '22023', message: 'promocion_reciente' }, 'Este campus ya se promovió hace menos de 180 días. Recarga la página para ver cuándo se habilita.'],
    [{ code: '42501', message: 'sin_autoridad' }, 'No tienes permiso para promover este campus.'],
    [{ code: '22023', message: 'decision_invalida' }, 'Cambiaron los grupos de 3er año. Recarga la página y vuelve a decidir.'],
    [{ code: 'XX000', message: 'boom' }, 'No se pudo promover. Inténtalo de nuevo.'],
  ])('explains the error %o and revalidates nothing', async (error, texto) => {
    rpc.mockResolvedValueOnce({ data: null, error })
    expect(await aplicarPromocion({ campusId: CAMPUS, decisiones: { [G1]: 'pasa_grupo' } })).toEqual({ ok: false, message: texto })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
