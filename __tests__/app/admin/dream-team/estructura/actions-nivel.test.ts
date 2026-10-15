/**
 * Estructura server actions — the rol level (odd/tasks/uno-a-uno.md, T1):
 * crearRol stores the chosen nivel, cambiarNivelRol changes it, and both
 * refuse any value outside the four levels before touching the repository.
 */
import { cambiarNivelRol, crearRol } from '@/app/(auth)/admin/dream-team/estructura/actions'

const createRol = jest.fn()
const updateRol = jest.fn()

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn(async () => ({})) }))
jest.mock('@/lib/platform/dream-team/route-access', () => ({
  isDreamTeamEnabled: () => true,
  requireDreamTeamSession: async () => ({ userId: 'admin' }),
  hasDreamTeamOrgManageCapability: () => true,
}))
jest.mock('@/lib/platform/dream-team/repository-supabase', () => ({
  createSupabaseDreamTeamRepository: () => ({ createRol, updateRol }),
}))

const ROL = { id: 'rol-1', equipoId: 'eq-1', label: 'Operador', nivel: 'lider', activo: true }

beforeEach(() => {
  createRol.mockReset().mockResolvedValue(ROL)
  updateRol.mockReset().mockResolvedValue(ROL)
})

describe('crearRol', () => {
  it('creates the rol with the chosen nivel', async () => {
    const resultado = await crearRol({ equipoId: 'eq-1', label: ' Operador ', nivel: 'lider' })

    expect(resultado).toEqual({ ok: true, rol: ROL })
    expect(createRol).toHaveBeenCalledWith({ equipoId: 'eq-1', label: 'Operador', nivel: 'lider', activo: true, parentRolId: undefined })
  })

  it.each(['pastor', 'Director', '', undefined])('refuses the nivel %p', async (nivel) => {
    const resultado = await crearRol({ equipoId: 'eq-1', label: 'Operador', nivel: nivel as never })

    expect(resultado).toEqual({ ok: false, error: 'invalid-input', message: 'El nivel del rol no es válido.' })
    expect(createRol).not.toHaveBeenCalled()
  })
})

describe('cambiarNivelRol', () => {
  it('changes only the nivel of the rol', async () => {
    const resultado = await cambiarNivelRol({ id: 'rol-1', nivel: 'coordinador' })

    expect(resultado).toEqual({ ok: true, rol: ROL })
    expect(updateRol).toHaveBeenCalledWith('rol-1', { nivel: 'coordinador' })
  })

  it('refuses a nivel outside the four', async () => {
    const resultado = await cambiarNivelRol({ id: 'rol-1', nivel: 'admin' as never })

    expect(resultado).toEqual({ ok: false, error: 'invalid-input', message: 'El nivel del rol no es válido.' })
    expect(updateRol).not.toHaveBeenCalled()
  })

  it('refuses a missing rol id', async () => {
    const resultado = await cambiarNivelRol({ id: ' ', nivel: 'lider' })

    expect(resultado).toEqual({ ok: false, error: 'invalid-input', message: 'Falta el rol.' })
    expect(updateRol).not.toHaveBeenCalled()
  })

  it('reports a rol that does not exist', async () => {
    updateRol.mockRejectedValue({ code: 'PGRST116' })

    const resultado = await cambiarNivelRol({ id: 'rol-x', nivel: 'lider' })

    expect(resultado).toEqual({ ok: false, error: 'not-found', message: 'El rol no existe o no es visible.' })
  })
})
