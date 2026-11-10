/**
 * @jest-environment node
 */
/**
 * «Lo hizo» of the home's «Próximo Paso de tus voluntarios»
 * (odd/tasks/home-por-rol.md T4, S5): marks or unmarks the milestone with
 * marcar_proximo_paso through the session client, so the database decides
 * who may mark (proximo_paso_puede_marcar). Its Spanish errors reach the
 * screen as they are; anything else gets a generic message.
 */
const rpc = jest.fn()
const getUser = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, rpc }),
}))

import { marcarProximoPasoVoluntario } from '@/lib/actions/proximo-paso.actions'

const PERSONA = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  rpc.mockReset()
  getUser.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } })
})

describe('marcarProximoPasoVoluntario', () => {
  it('marca y devuelve lo que quedó en la base', async () => {
    rpc.mockResolvedValue({ data: { usuario_id: PERSONA, hecho: true, marcado: true, por_certificado: false }, error: null })

    await expect(marcarProximoPasoVoluntario(PERSONA, true)).resolves.toEqual({ ok: true, hecho: true })
    expect(rpc).toHaveBeenCalledWith('marcar_proximo_paso', { p_usuario_id: PERSONA, p_hecho: true })
  })

  it('al desmarcar sigue hecho si tiene el certificado del taller', async () => {
    rpc.mockResolvedValue({ data: { usuario_id: PERSONA, hecho: true, marcado: false, por_certificado: true }, error: null })

    await expect(marcarProximoPasoVoluntario(PERSONA, false)).resolves.toEqual({ ok: true, hecho: true })
    expect(rpc).toHaveBeenCalledWith('marcar_proximo_paso', { p_usuario_id: PERSONA, p_hecho: false })
  })

  it('sin permiso muestra el mensaje de la base', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'No tienes permiso para marcar Próximo Paso de esta persona.' } })

    await expect(marcarProximoPasoVoluntario(PERSONA, true)).resolves.toEqual({
      ok: false,
      message: 'No tienes permiso para marcar Próximo Paso de esta persona.',
    })
  })

  it('un error sin texto para la persona da un mensaje genérico y se registra', async () => {
    const consola = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'internal error at line 4' } })

    await expect(marcarProximoPasoVoluntario(PERSONA, true)).resolves.toEqual({
      ok: false,
      message: 'No pudimos guardar la marca. Inténtalo de nuevo.',
    })
    expect(consola).toHaveBeenCalled()
    consola.mockRestore()
  })

  it('rechaza datos mal formados sin llamar a la base', async () => {
    await expect(marcarProximoPasoVoluntario('no-es-uuid', true)).resolves.toEqual({ ok: false, message: 'Revisa los datos e inténtalo de nuevo.' })
    await expect(marcarProximoPasoVoluntario(PERSONA, 'si' as unknown as boolean)).resolves.toEqual({ ok: false, message: 'Revisa los datos e inténtalo de nuevo.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sin sesión no llama a la base', async () => {
    getUser.mockResolvedValue({ data: { user: null } })

    await expect(marcarProximoPasoVoluntario(PERSONA, true)).resolves.toEqual({ ok: false, message: 'Tu sesión terminó. Vuelve a iniciar sesión.' })
    expect(rpc).not.toHaveBeenCalled()
  })
})
