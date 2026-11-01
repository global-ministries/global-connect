/**
 * Server action of the live view (C4b): it reads estudiantes_en_vivo with the
 * session client, checks the ids and the date before calling, never
 * revalidates (the client swaps the data in place) and returns the RPC error
 * in Spanish with its code.
 */
const rpc = jest.fn()
const getUser = jest.fn()
const revalidatePath = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, rpc }),
}))
jest.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }))

import { refrescarVivo } from '@/lib/actions/estudiantes-vivo.actions'

const AMBITO = '11111111-1111-4111-8111-111111111111'
const TURNO = '66666666-6666-4666-8666-666666666666'
const ENTRADA = { ambitoId: AMBITO, fecha: '2026-10-25', turnoId: TURNO }

beforeEach(() => {
  rpc.mockReset()
  getUser.mockReset()
  revalidatePath.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('refrescarVivo', () => {
  it('reads the live data of the meeting', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        ambito_id: AMBITO,
        fecha: '2026-10-25',
        turno_id: TURNO,
        grupos: [{ grupo_id: 'g1', nombre: '1er año · Chicas', subarea: 'Grupos de Chicas', lideres: ['Fernanda Ochoa'], presentes: 3, ausentes: 1, visitantes: 0, sin_marcar: 2 }],
        visitantes_hoy: [],
      },
      error: null,
    })
    const r = await refrescarVivo(ENTRADA)
    expect(rpc).toHaveBeenCalledWith('estudiantes_en_vivo', { p_ambito_id: AMBITO, p_fecha: '2026-10-25', p_turno_id: TURNO })
    expect(r).toMatchObject({ ok: true, data: { fecha: '2026-10-25', grupos: [{ grupoId: 'g1', presentes: 3, sinMarcar: 2 }], visitantesHoy: [] } })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects bad ids or dates before calling', async () => {
    expect(await refrescarVivo({ ...ENTRADA, ambitoId: 'x' })).toEqual({ ok: false, message: 'Revisa los datos e inténtalo de nuevo.', codigo: 'datos_invalidos' })
    expect(await refrescarVivo({ ...ENTRADA, fecha: '25/10/2026' })).toMatchObject({ ok: false, codigo: 'datos_invalidos' })
    expect(await refrescarVivo({ ...ENTRADA, turnoId: null as unknown as string })).toMatchObject({ ok: false, codigo: 'datos_invalidos' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps the RPC errors, ambito_invalido included', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'ambito_invalido' } })
    expect(await refrescarVivo(ENTRADA)).toEqual({
      ok: false,
      message: 'Ese ámbito ya no tiene vista en vivo. Recarga la página.',
      codigo: 'ambito_invalido',
    })
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'permission denied' } })
    expect(await refrescarVivo(ENTRADA)).toEqual({ ok: false, message: 'No tienes acceso a la vista en vivo de este ámbito.', codigo: 'sin_autoridad' })
  })

  it('treats an empty payload as a failed refresh', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    expect(await refrescarVivo(ENTRADA)).toMatchObject({ ok: false, message: 'No se pudo actualizar la vista en vivo. Se reintenta sola.' })
  })

  it('asks to sign in again without a session', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await refrescarVivo(ENTRADA)).toEqual({ ok: false, message: 'Tu sesión terminó. Vuelve a iniciar sesión.', codigo: null })
    expect(rpc).not.toHaveBeenCalled()
  })
})
