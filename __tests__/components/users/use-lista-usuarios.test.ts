/**
 * useListaUsuarios (T8-2 of odd/tasks/sistema-diseno-v2.md, S13): the /users
 * data on the v2 RPCs, driven by the URL filters. The list gets every filter,
 * the sort and the page window (argumentosLista); the attention metrics and
 * the hero count the whole scope (argumentosEstadisticas: only the caller and
 * the campus), so a filter change does not reload them.
 */
import { act, renderHook } from '@testing-library/react'

import { useListaUsuarios } from '@/components/users/lista/use-lista-usuarios'
import { FILTROS_INICIALES, type FiltrosUsuarios } from '@/lib/platform/usuarios/lista-vista'

const rpc = jest.fn()
const supabase = { rpc: (...args: unknown[]) => rpc(...args) }
const notificarError = jest.fn()
// useNotificaciones is memoized: one object for the whole test.
const notificaciones = { error: (m: string) => notificarError(m), success: jest.fn() }
let authUserId: string | null = 'auth-1'

jest.mock('@/lib/supabase/client', () => ({ createClient: () => supabase }))
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => notificaciones }))
jest.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ authUserId }) }))

const LISTAR = 'listar_usuarios_con_permisos_v2'
const ESTADISTICAS = 'obtener_estadisticas_usuarios_con_permisos_v2'

const filas = [
  { id: 'u-1', nombre: 'Ana', apellido: 'Pérez', rol_nombre_interno: 'lider', total_count: 41, cuenta: 'si', es_de_mi_grupo: false },
  { id: 'u-1', nombre: 'Ana', apellido: 'Pérez', rol_nombre_interno: 'pastor', total_count: 41, cuenta: 'si', es_de_mi_grupo: false },
  { id: 'u-2', nombre: 'Luis', apellido: 'Barrios', rol_nombre_interno: 'miembro', total_count: 41, cuenta: 'no', es_de_mi_grupo: true },
]
const stats = {
  total_usuarios: 148, con_email: 123, con_telefono: 132, registrados_hoy: 1,
  nuevos_7d: 8, sin_grupo: 62, sin_cuenta: 44, sin_telefono: 16, invitadas: 9,
}

const f = (cambios: Partial<FiltrosUsuarios> = {}): FiltrosUsuarios => ({ ...FILTROS_INICIALES, ...cambios })
const llamadasA = (nombre: string) => rpc.mock.calls.filter(([n]) => n === nombre).map(([, params]) => params)

async function asentar() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  rpc.mockReset()
  notificarError.mockReset()
  authUserId = 'auth-1'
  rpc.mockImplementation(async (nombre: string) =>
    nombre === LISTAR ? { data: filas, error: null } : { data: [stats], error: null },
  )
})

describe('useListaUsuarios', () => {
  it('lists with every filter and the page window, one person per id, total from total_count', async () => {
    const { result } = renderHook(() =>
      useListaUsuarios({ filtros: f({ q: ' 0414 ', conCuenta: false, nuevos: true, orden: 'registro_desc', pagina: 2 }), campusId: 'c-1', limite: 50 }),
    )
    expect(result.current.cargando).toBe(true)
    await asentar()

    expect(llamadasA(LISTAR)).toEqual([
      {
        p_auth_id: 'auth-1', p_busqueda: '0414', p_con_cuenta: false, p_nuevos_dias: 7,
        p_orden: 'registro_desc', p_limite: 50, p_offset: 50, p_campus_id: 'c-1',
      },
    ])
    expect(result.current.cargando).toBe(false)
    expect(result.current.total).toBe(41)
    expect(result.current.personas.map((p) => [p.id, p.roles])).toEqual([
      ['u-1', ['pastor', 'lider']],
      ['u-2', ['miembro']],
    ])
  })

  it('the statistics count the whole scope and do not reload on a filter change', async () => {
    const { result, rerender } = renderHook((props: { filtros: FiltrosUsuarios }) => useListaUsuarios({ ...props, campusId: null, limite: 20 }), {
      initialProps: { filtros: f() },
    })
    await asentar()
    expect(llamadasA(ESTADISTICAS)).toEqual([{ p_auth_id: 'auth-1' }])
    expect(result.current.estadisticas?.total).toBe(148)
    expect(result.current.estadisticas?.invitadas).toBe(9)

    rerender({ filtros: f({ enGrupo: false }) })
    await asentar()

    expect(llamadasA(LISTAR)).toHaveLength(2)
    expect(llamadasA(LISTAR)[1]).toEqual(expect.objectContaining({ p_en_grupo: false, p_offset: 0 }))
    expect(llamadasA(ESTADISTICAS)).toHaveLength(1)
  })

  it('waits for the session before querying', async () => {
    authUserId = null
    const { result } = renderHook(() => useListaUsuarios({ filtros: f(), campusId: null, limite: 20 }))
    await asentar()

    expect(rpc).not.toHaveBeenCalled()
    expect(result.current.cargando).toBe(true)
  })

  it('an empty page reads total 0', async () => {
    rpc.mockImplementation(async (nombre: string) => (nombre === LISTAR ? { data: [], error: null } : { data: [stats], error: null }))
    const { result } = renderHook(() => useListaUsuarios({ filtros: f({ q: 'nadie' }), campusId: null, limite: 20 }))
    await asentar()

    expect(result.current.total).toBe(0)
    expect(result.current.personas).toEqual([])
  })

  it('a list error is shown and notified; the statistics still load', async () => {
    rpc.mockImplementation(async (nombre: string) =>
      nombre === LISTAR ? { data: null, error: { message: 'sin permiso' } } : { data: [stats], error: null },
    )
    const { result } = renderHook(() => useListaUsuarios({ filtros: f(), campusId: null, limite: 20 }))
    await asentar()

    expect(result.current.error).toBe('sin permiso')
    expect(notificarError).toHaveBeenCalledWith('sin permiso')
    expect(result.current.cargando).toBe(false)
    expect(result.current.estadisticas?.total).toBe(148)
  })

  it('recargar reloads the list and the statistics', async () => {
    const { result } = renderHook(() => useListaUsuarios({ filtros: f(), campusId: null, limite: 20 }))
    await asentar()
    rpc.mockClear()

    act(() => result.current.recargar())
    await asentar()

    expect(llamadasA(LISTAR)).toHaveLength(1)
    expect(llamadasA(ESTADISTICAS)).toHaveLength(1)
  })

  it('a slower, older answer never replaces the newer one', async () => {
    let soltarVieja: (valor: unknown) => void = () => {}
    rpc.mockImplementation((nombre: string, params: { p_busqueda: string }) => {
      if (nombre !== LISTAR) return Promise.resolve({ data: [stats], error: null })
      if (params.p_busqueda === 'vieja') return new Promise((resolve) => { soltarVieja = resolve })
      return Promise.resolve({ data: [filas[2]], error: null })
    })
    const { result, rerender } = renderHook((props: { filtros: FiltrosUsuarios }) => useListaUsuarios({ ...props, campusId: null, limite: 20 }), {
      initialProps: { filtros: f({ q: 'vieja' }) },
    })
    rerender({ filtros: f({ q: 'nueva' }) })
    await asentar()
    await act(async () => {
      soltarVieja({ data: filas, error: null })
      await Promise.resolve()
    })

    expect(result.current.personas.map((p) => p.id)).toEqual(['u-2'])
  })
})
