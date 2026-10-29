/**
 * useUsuariosConPermisos on the v2 RPCs (T8-1 of odd/tasks/sistema-diseno-v2.md,
 * S13): the new filters (cuenta, nuevos, orden) reach the list RPC, a change
 * goes back to page 1, rows carry the account state, group, campus and
 * es_de_mi_grupo, and the statistics carry the attention counts.
 */
import { act, renderHook } from '@testing-library/react'

import { useUsuariosConPermisos } from '@/hooks/use-usuarios-con-permisos'

const rpc = jest.fn()
const supabase = { rpc: (...args: unknown[]) => rpc(...args), from: jest.fn() }
const toast = jest.fn()

jest.mock('@/lib/supabase/client', () => ({ createClient: () => supabase }))
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }))
jest.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ authUserId: 'auth-1' }) }))

const LISTAR = 'listar_usuarios_con_permisos_v2'
const ESTADISTICAS = 'obtener_estadisticas_usuarios_con_permisos_v2'

const fila = {
  id: 'u-1', nombre: 'Ana', apellido: 'Pérez', total_count: 30, cuenta: 'invitada',
  grupo_id: 'g-1', grupo_nombre: 'Familias Unidas', campus_nombre: 'Barquisimeto', es_de_mi_grupo: true,
}
const stats = {
  total_usuarios: 30, con_email: 20, con_telefono: 25, registrados_hoy: 1,
  nuevos_7d: 4, sin_grupo: 9, sin_cuenta: 7, sin_telefono: 5, invitadas: 2,
}

async function asentar() {
  await act(async () => {
    await Promise.resolve()
  })
}

const llamadasA = (nombre: string) => rpc.mock.calls.filter(([n]) => n === nombre).map(([, params]) => params)

beforeEach(() => {
  rpc.mockReset()
  toast.mockReset()
  rpc.mockImplementation(async (nombre: string) =>
    nombre === LISTAR ? { data: [fila], error: null } : { data: [stats], error: null }
  )
})

describe('useUsuariosConPermisos v2', () => {
  it('sends cuenta, nuevos and orden to the list RPC', async () => {
    const { result } = renderHook(() => useUsuariosConPermisos({ campusId: 'c-1' }))
    await asentar()
    rpc.mockClear()

    act(() => result.current.actualizarFiltros({ con_cuenta: false, nuevos_dias: 7, orden: 'registro_desc' }))
    await asentar()

    expect(llamadasA(LISTAR).at(-1)).toEqual(
      expect.objectContaining({
        p_auth_id: 'auth-1', p_con_cuenta: false, p_nuevos_dias: 7, p_orden: 'registro_desc', p_campus_id: 'c-1', p_offset: 0,
      })
    )
  })

  it('leaves the new filters out by default and sorts by name', async () => {
    renderHook(() => useUsuariosConPermisos())
    await asentar()

    const params = llamadasA(LISTAR).at(-1) as Record<string, unknown>
    expect(params.p_orden).toBe('nombre')
    expect(params).not.toHaveProperty('p_con_cuenta')
    expect(params).not.toHaveProperty('p_nuevos_dias')
  })

  it('a new sort goes back to page 1', async () => {
    const { result } = renderHook(() => useUsuariosConPermisos())
    await asentar()
    act(() => result.current.cambiarPagina(2))
    await asentar()

    act(() => result.current.actualizarFiltros({ orden: 'registro_asc' }))
    await asentar()

    expect(result.current.paginaActual).toBe(1)
    expect(llamadasA(LISTAR).at(-1)).toEqual(expect.objectContaining({ p_orden: 'registro_asc', p_offset: 0 }))
  })

  it('rows carry the account state, group, campus and es_de_mi_grupo; stats the attention counts', async () => {
    const { result } = renderHook(() => useUsuariosConPermisos({ campusId: 'c-2' }))
    await asentar()
    await asentar()

    expect(result.current.usuarios[0]).toEqual(expect.objectContaining({
      cuenta: 'invitada', grupo_nombre: 'Familias Unidas', campus_nombre: 'Barquisimeto', es_de_mi_grupo: true,
    }))
    expect(result.current.totalUsuarios).toBe(30)
    expect(result.current.estadisticas).toEqual(stats)
    expect(llamadasA(ESTADISTICAS).at(-1)).toEqual(expect.objectContaining({ p_auth_id: 'auth-1', p_campus_id: 'c-2' }))
  })
})
