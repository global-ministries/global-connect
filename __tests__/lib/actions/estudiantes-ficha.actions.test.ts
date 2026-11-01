/**
 * Server actions of the "Año escolar" editor (C6b4, S16): they check the
 * input before calling estudiantes_ficha / estudiantes_ficha_guardar with the
 * session client, revalidate the Estudiantes pages that show the year only
 * after a save worked, and return the RPC errors in Spanish with their code.
 */
const rpc = jest.fn()
const getUser = jest.fn()
const revalidatePath = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, rpc }),
}))
jest.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }))

import { guardarFicha, leerFicha } from '@/lib/actions/estudiantes-ficha.actions'

const PERSONA = 'b0000000-0000-4000-8000-000000000030'
const DATOS_INVALIDOS = 'Revisa los datos e inténtalo de nuevo.'
const SIN_SESION = 'Tu sesión terminó. Vuelve a iniciar sesión.'

beforeEach(() => {
  rpc.mockReset()
  getUser.mockReset()
  revalidatePath.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('leerFicha', () => {
  it('reads the ficha of a person', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        persona_id: PERSONA,
        campus_id: 'c1',
        anio_actual: 2,
        anio_final: 6,
        egresado: false,
        puede_editar: true,
        escala: [{ numero: 2, etiqueta: '2do año', ambito: 'Transit' }],
      },
      error: null,
    })
    expect(await leerFicha(PERSONA)).toEqual({
      ok: true,
      data: {
        personaId: PERSONA,
        campusId: 'c1',
        anioActual: 2,
        anioFinal: 6,
        egresado: false,
        puedeEditar: true,
        escala: [{ numero: 2, etiqueta: '2do año', ambito: 'Transit' }],
      },
    })
    expect(rpc).toHaveBeenCalledWith('estudiantes_ficha', { p_persona_id: PERSONA })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('returns the code of The Living Room so the editor hides', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'anio_no_aplica' } })
    expect(await leerFicha(PERSONA)).toEqual({ ok: false, message: 'The Living Room no lleva año escolar.', codigo: 'anio_no_aplica' })
  })

  it('explains an unknown error and a malformed answer', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'boom' } })
    expect(await leerFicha(PERSONA)).toEqual({ ok: false, message: 'No se pudo cargar el año escolar.', codigo: null })
    rpc.mockResolvedValueOnce({ data: 'nada', error: null })
    expect(await leerFicha(PERSONA)).toEqual({ ok: false, message: 'No se pudo cargar el año escolar.', codigo: null })
  })

  it('rejects a bad id before calling', async () => {
    expect(await leerFicha('x')).toEqual({ ok: false, message: DATOS_INVALIDOS, codigo: 'datos_invalidos' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('asks to sign in again without a session', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await leerFicha(PERSONA)).toEqual({ ok: false, message: SIN_SESION, codigo: null })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('guardarFicha', () => {
  it('saves both years and revalidates the pages that show them', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    expect(await guardarFicha(PERSONA, 3, 5)).toEqual({ ok: true, data: null })
    expect(rpc).toHaveBeenCalledWith('estudiantes_ficha_guardar', { p_persona_id: PERSONA, p_anio_actual: 3, p_anio_final: 5 })
    expect(revalidatePath.mock.calls).toEqual([
      ['/estudiantes'],
      ['/estudiantes/grupos'],
      ['/estudiantes/grupos/[grupoId]', 'page'],
      ['/estudiantes/promocion'],
    ])
  })

  it('sends a NULL año final (the last year of the scale)', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    expect(await guardarFicha(PERSONA, 3, null)).toEqual({ ok: true, data: null })
    expect(rpc).toHaveBeenCalledWith('estudiantes_ficha_guardar', { p_persona_id: PERSONA, p_anio_actual: 3, p_anio_final: null })
  })

  it.each([
    ['a bad id', ['x', 3, 5]],
    ['a decimal año actual', [PERSONA, 2.5, 5]],
    ['a text año actual', [PERSONA, '3', 5]],
    ['no año actual', [PERSONA, null, 5]],
    ['a decimal año final', [PERSONA, 3, 5.5]],
    ['a negative year', [PERSONA, -1, 5]],
  ])('rejects %s before calling', async (_caso, args) => {
    const [persona, actual, final] = args as [string, number, number | null]
    expect(await guardarFicha(persona, actual, final)).toEqual({ ok: false, message: DATOS_INVALIDOS, codigo: 'datos_invalidos' })
    expect(rpc).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('asks to sign in again without a session', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await guardarFicha(PERSONA, 3, 5)).toEqual({ ok: false, message: SIN_SESION, codigo: null })
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    [{ code: '42501', message: 'sin_autoridad' }, 'No tienes permiso para editar el año escolar de esta persona.', 'sin_autoridad'],
    [{ code: '22023', message: 'anio_invalido' }, 'Elige años de la escala de tu campus. El año final no puede ser anterior al actual.', 'anio_invalido'],
    [{ code: 'XX000', message: 'boom' }, 'No se pudo guardar el año escolar. Inténtalo de nuevo.', null],
  ])('explains the error %o and revalidates nothing', async (error, message, codigo) => {
    rpc.mockResolvedValueOnce({ data: null, error })
    expect(await guardarFicha(PERSONA, 3, 5)).toEqual({ ok: false, message, codigo })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
