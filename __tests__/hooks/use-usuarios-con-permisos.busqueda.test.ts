/**
 * useUsuariosConPermisos: a confirmed search applies immediately. There is no
 * debounce on the search text (the page confirms with Enter / "Buscar"), so the
 * RPC must run without any timer being advanced, and a new search goes back to
 * the first page.
 */
import { act, renderHook } from '@testing-library/react'

import { useUsuariosConPermisos } from '@/hooks/use-usuarios-con-permisos'

const rpc = jest.fn()
const supabase = { rpc: (...args: unknown[]) => rpc(...args), from: jest.fn() }
const toast = jest.fn()

// A stable client: the hook lists it as an effect dependency.
jest.mock('@/lib/supabase/client', () => ({ createClient: () => supabase }))
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }))
jest.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ authUserId: 'auth-1' }) }))

const LISTAR = 'listar_usuarios_con_permisos'
const ESTADISTICAS = 'obtener_estadisticas_usuarios_con_permisos'

const fila = (id: string) => ({ id, nombre: 'Ana', apellido: 'Pérez', total_count: 50 })

// Lets pending promises and the effects they trigger settle without touching timers.
async function asentar() {
  await act(async () => {
    await Promise.resolve()
  })
}

const llamadasA = (nombre: string) => rpc.mock.calls.filter(([n]) => n === nombre).map(([, params]) => params)

beforeEach(() => {
  jest.useFakeTimers()
  rpc.mockReset()
  toast.mockReset()
  rpc.mockImplementation(async (nombre: string) =>
    nombre === LISTAR ? { data: [fila('u-1')], error: null } : { data: [], error: null }
  )
})

afterEach(() => {
  jest.useRealTimers()
})

describe('useUsuariosConPermisos search', () => {
  it('queries with the new search right away, without waiting for any timer', async () => {
    const { result } = renderHook(() => useUsuariosConPermisos())
    await asentar()
    rpc.mockClear()

    act(() => result.current.actualizarFiltros({ busqueda: 'ana' }))
    await asentar()

    // No jest.advanceTimersByTime anywhere: the old 400 ms debounce would have kept this at ''.
    expect(llamadasA(LISTAR).length).toBeGreaterThan(0)
    expect(llamadasA(LISTAR).at(-1)).toEqual(
      expect.objectContaining({ p_auth_id: 'auth-1', p_busqueda: 'ana' })
    )
    expect(result.current.filtros.busqueda).toBe('ana')
  })

  it('sends the same search to the stats RPC', async () => {
    const { result } = renderHook(() => useUsuariosConPermisos())
    await asentar()
    rpc.mockClear()

    act(() => result.current.actualizarFiltros({ busqueda: 'estadisticas-sin-espera' }))
    await asentar()

    expect(llamadasA(ESTADISTICAS)).toEqual([
      expect.objectContaining({ p_auth_id: 'auth-1', p_busqueda: 'estadisticas-sin-espera' }),
    ])
  })

  it('goes back to page 1 on a new search', async () => {
    const { result } = renderHook(() => useUsuariosConPermisos())
    await asentar()

    act(() => result.current.cambiarPagina(2))
    await asentar()
    expect(result.current.paginaActual).toBe(2)
    expect(llamadasA(LISTAR).at(-1)).toEqual(expect.objectContaining({ p_offset: 20 }))
    rpc.mockClear()

    act(() => result.current.actualizarFiltros({ busqueda: 'ana' }))
    await asentar()

    expect(result.current.paginaActual).toBe(1)
    expect(llamadasA(LISTAR).at(-1)).toEqual(
      expect.objectContaining({ p_busqueda: 'ana', p_offset: 0 })
    )
  })

  it('shows everyone again when the search is cleared', async () => {
    const { result } = renderHook(() => useUsuariosConPermisos())
    await asentar()
    act(() => result.current.actualizarFiltros({ busqueda: 'ana' }))
    await asentar()
    rpc.mockClear()

    act(() => result.current.actualizarFiltros({ busqueda: '' }))
    await asentar()

    expect(llamadasA(LISTAR).at(-1)).toEqual(expect.objectContaining({ p_busqueda: '' }))
  })
})
