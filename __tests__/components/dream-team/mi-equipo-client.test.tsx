/**
 * `<MiEquipoClient>` — island for /dream-team/mi-equipo.
 *
 * Replaces the old tree-rendering suite (nested nodes, per-node rol chips,
 * per-row "Cambiar etapa", "Sin servidores", collapsed Grupos de Vida
 * segmentos): the screen now shows one direccion, one card per team and the
 * people of the selected team. Acceptance criteria 1-4 and 6 of
 * odd/tasks/dream-team-mi-equipo-rediseno.md are expressed with the
 * Conexión-shaped fixture (4 equipos, 38 personas).
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { MiEquipoClient, type MiEquipoClientProps } from '@/components/dream-team/mi-equipo/mi-equipo-client'
import {
  listarDirecciones,
  vistaDeDireccion,
  type PersonaEntrada,
  type PersonasPorEquipo,
} from '@/lib/platform/dream-team/mi-equipo-vista'
import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { NodoEquipoArbol } from '@/lib/platform/dream-team/estructura-arbol'
import { personaId } from '@/lib/platform/dream-team/types'
import {
  ID_CONEXION,
  arbolConexion,
  personasPorEquipoConexion,
} from '@/tests/helpers/mi-equipo-conexion'

const replace = jest.fn()
let campusActivoId: string | null = null

jest.mock('@/hooks/useCampus', () => ({
  useCampus: () => ({ campusId: campusActivoId }),
}))
const refresh = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh, push: jest.fn() }),
}))

// ContenedorDashboard lazy-loads its header behind Suspense — same synchronous
// test double as __tests__/app/dashboard-page.test.tsx.
jest.mock('@/components/ui/sistema-diseno', () => ({
  ...jest.requireActual('@/components/ui/sistema-diseno'),
  ContenedorDashboard: ({ children, titulo }: { children: React.ReactNode; titulo?: string }) => (
    <section>
      <h1>{titulo}</h1>
      {children}
    </section>
  ),
}))

beforeEach(() => {
  campusActivoId = null
  replace.mockClear()
  refresh.mockClear()
})

function propsConexion(overrides: Partial<MiEquipoClientProps> = {}): MiEquipoClientProps {
  return {
    direcciones: listarDirecciones(arbolConexion, personasPorEquipoConexion),
    vista: vistaDeDireccion(arbolConexion, personasPorEquipoConexion, ID_CONEXION),
    direccionId: ID_CONEXION,
    puedeEditar: false,
    equiposAsignables: [],
    rolesPorEquipo: {},
    ...overrides,
  }
}

const filas = () => {
  const lista = screen.queryByRole('list', { name: 'Personas del equipo' })
  return lista ? within(lista).getAllByRole('listitem') : []
}
const textoDeFilas = () => filas().map((fila) => fila.textContent ?? '')
const tarjeta = (prefijo: string) => screen.getByRole('button', { name: (nombre) => nombre.startsWith(prefijo) })

describe('MiEquipoClient — direccion header (criteria 1, 2 and 6)', () => {
  it('shows the direccion, who leads it and the totals', () => {
    render(<MiEquipoClient {...propsConexion()} />)
    expect(screen.getByRole('heading', { name: 'Dirección de Conexión' })).toBeInTheDocument()
    expect(screen.getByText('Dirige Antholy Ludovic Gómez · 38 personas en 4 equipos')).toBeInTheDocument()
  })

  it('offers a direccion selector to someone who reaches several and navigates by URL', async () => {
    const direcciones = [
      { id: ID_CONEXION, label: 'Dirección de Conexión', total: 38 },
      { id: 'dir-otra', label: 'Dirección de Alabanza', total: 5 },
    ]
    render(<MiEquipoClient {...propsConexion({ direcciones })} />)
    const select = screen.getByLabelText('Dirección')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Dirección de Conexión',
      'Dirección de Alabanza',
    ])
    await userEvent.selectOptions(select, 'dir-otra')
    expect(replace).toHaveBeenCalledWith('?direccion=dir-otra')
  })

  it('shows no selector to someone who reaches a single direccion', () => {
    render(<MiEquipoClient {...propsConexion()} />)
    expect(screen.queryByLabelText('Dirección')).not.toBeInTheDocument()
  })

  it('never shows empty or inactive direcciones, nor a configured-roles chip', () => {
    render(<MiEquipoClient {...propsConexion()} />)
    expect(screen.queryByText(/Dirección Vacía/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Dirección Antigua/)).not.toBeInTheDocument()
    expect(screen.queryByText(/roles configurados/i)).not.toBeInTheDocument()
  })

  it('explains an empty scope instead of rendering a blank screen', () => {
    render(<MiEquipoClient {...propsConexion({ direcciones: [], vista: null })} />)
    expect(screen.getByText('Todavía no hay equipos para mostrar')).toBeInTheDocument()
  })
})

describe('MiEquipoClient — team cards (criteria 1 and 3)', () => {
  it('renders Toda la dirección plus one card per team, with 38 people listed', () => {
    render(<MiEquipoClient {...propsConexion()} />)
    const grupo = screen.getByRole('group', { name: 'Equipos' })
    const nombres = within(grupo).getAllByRole('button').map((b) => b.getAttribute('aria-pressed'))
    expect(nombres).toHaveLength(5)
    expect(tarjeta('Toda la dirección')).toHaveAttribute('aria-pressed', 'true')
    for (const equipo of ['De Hombre a Hombre', 'Parejas', 'Punto de Partida', 'Mujer de Hoy']) {
      expect(tarjeta(equipo)).toHaveAttribute('aria-pressed', 'false')
    }
    expect(filas()).toHaveLength(38)
  })

  it('shows the responsable and how many are waiting to be activated', () => {
    render(<MiEquipoClient {...propsConexion()} />)
    expect(tarjeta('De Hombre a Hombre')).toHaveTextContent('Coordina Edmir Muñoz')
    expect(tarjeta('De Hombre a Hombre')).toHaveTextContent('1 por activar')
    expect(tarjeta('Parejas')).not.toHaveTextContent('por activar')
    expect(tarjeta('Toda la dirección')).toHaveTextContent('Dirige Antholy Ludovic Gómez')
  })

  it('narrows the list to Parejas with the coordinador first', async () => {
    render(<MiEquipoClient {...propsConexion()} />)
    await userEvent.click(tarjeta('Parejas'))
    expect(tarjeta('Parejas')).toHaveAttribute('aria-pressed', 'true')
    expect(tarjeta('Toda la dirección')).toHaveAttribute('aria-pressed', 'false')
    expect(filas()).toHaveLength(8)
    expect(filas()[0]).toHaveTextContent('Ludovic Gómez')
    expect(filas()[0]).toHaveTextContent('Coordinador')
  })

  it('lists the direccion director only under Toda la dirección', async () => {
    render(<MiEquipoClient {...propsConexion()} />)
    expect(screen.getByText('Antholy Ludovic Gómez', { selector: 'li *' })).toBeInTheDocument()
    await userEvent.click(tarjeta('Mujer de Hoy'))
    expect(screen.queryByText('Antholy Ludovic Gómez', { selector: 'li *' })).not.toBeInTheDocument()
  })
})

describe('MiEquipoClient — search and estado filters (criterion 4)', () => {
  it('searches inside the selected team and reflects it in the filter counters', async () => {
    render(<MiEquipoClient {...propsConexion()} />)
    await userEvent.click(tarjeta('Mujer de Hoy'))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar persona' }), 'blanca')
    expect(filas()).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Todos · 2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Activos · 2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'En orientación · 0' })).toBeInTheDocument()
  })

  it('counts by estado, hides estados nobody is in, and filters by pill', async () => {
    render(<MiEquipoClient {...propsConexion()} />)
    expect(screen.getByRole('button', { name: 'Todos · 38' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Activos · 35' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'En pausa · 1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Postulado/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Retirado/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'En pausa · 1' }))
    expect(filas()).toHaveLength(1)
    expect(filas()[0]).toHaveTextContent('En pausa')
  })

  it('says so when nobody matches', async () => {
    render(<MiEquipoClient {...propsConexion()} />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar persona' }), 'zzzz')
    expect(screen.getByText('Nadie coincide con esa búsqueda')).toBeInTheDocument()
    expect(filas()).toHaveLength(0)
  })

  it('matches names without caring about accents or case', async () => {
    render(<MiEquipoClient {...propsConexion()} />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar persona' }), 'PEREZ')
    expect(filas()).toHaveLength(1)
    expect(filas()[0]).toHaveTextContent('Edith Pérez')
  })
})

describe('MiEquipoClient — pendientes strip (criterion 5, first half)', () => {
  it('announces the people waiting and Revisar filters the list to them', async () => {
    render(<MiEquipoClient {...propsConexion()} />)
    const franja = screen.getByRole('region', { name: 'Pendientes' })
    expect(franja).toHaveTextContent('2 personas esperan que las actives')
    expect(franja).toHaveTextContent('Luis Barrios')
    expect(franja).toHaveTextContent('Wilennys García')
    await userEvent.click(screen.getByRole('button', { name: 'Revisar' }))
    expect(tarjeta('Toda la dirección')).toHaveAttribute('aria-pressed', 'true')
    expect(filas()).toHaveLength(2)
    expect(textoDeFilas().some((t) => t.includes('Luis Barrios'))).toBe(true)
    expect(textoDeFilas().some((t) => t.includes('Wilennys García'))).toBe(true)
  })

  it('uses the singular for one person and disappears when nobody waits', () => {
    const conUno: PersonasPorEquipo = {
      ...personasPorEquipoConexion,
      'eq-pdp': personasPorEquipoConexion['eq-pdp'].map((p) => (p.estado === 'en_orientacion' ? { ...p, estado: 'activo' as const } : p)),
    }
    const { rerender } = render(
      <MiEquipoClient {...propsConexion({ vista: vistaDeDireccion(arbolConexion, conUno, ID_CONEXION) })} />,
    )
    expect(screen.getByRole('region', { name: 'Pendientes' })).toHaveTextContent('1 persona espera que la actives')

    const sinNadie: PersonasPorEquipo = {
      ...conUno,
      'eq-dhah': conUno['eq-dhah'].map((p) => ({ ...p, estado: 'activo' as const })),
    }
    rerender(<MiEquipoClient {...propsConexion({ vista: vistaDeDireccion(arbolConexion, sinNadie, ID_CONEXION) })} />)
    expect(screen.queryByRole('region', { name: 'Pendientes' })).not.toBeInTheDocument()
  })
})

describe('MiEquipoClient — compact mode and Grupos de Vida', () => {
  const grupos = 10
  const arbolGdv: readonly NodoArbol<NodoEquipoArbol>[] = [
    {
      equipo: { origen: 'dream_team', id: 'gdv', label: 'Grupos de Vida', experiencia: 'atraccion', activo: true, responsables: [] },
      hijos: Array.from({ length: grupos }, (_, i) => ({
        equipo: { origen: 'grupos_vida' as const, tipo: 'grupo' as const, id: `grupo-${i}`, label: `Grupo ${i}`, activo: true, responsables: [] },
        hijos: [],
        nivel: 1,
      })),
      nivel: 0,
    },
  ]
  const lider = (i: number): PersonaEntrada => ({
    clave: `gdv:${i}`,
    personaId: personaId(`gdv-${i}`),
    nombre: `Lider ${i}`,
    rolClave: 'lider',
    rolLabel: 'Líder de grupo',
    estado: 'activo',
    origen: 'grupos_vida',
  })
  const personasGdv: PersonasPorEquipo = Object.fromEntries(Array.from({ length: grupos }, (_, i) => [`grupo-${i}`, [lider(i)]]))
  const propsGdv = (): MiEquipoClientProps => ({
    ...propsConexion(),
    direcciones: listarDirecciones(arbolGdv, personasGdv),
    vista: vistaDeDireccion(arbolGdv, personasGdv, 'gdv'),
    direccionId: 'gdv',
  })

  it('switches to a compact team list with its own filter above 8 teams', async () => {
    render(<MiEquipoClient {...propsGdv()} />)
    const grupo = screen.getByRole('group', { name: 'Equipos' })
    expect(within(grupo).getAllByRole('button')).toHaveLength(grupos + 1)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar equipo' }), 'Grupo 3')
    expect(within(grupo).getAllByRole('button').map((b) => b.textContent)).toEqual([
      expect.stringContaining('Grupo 3'),
    ])
  })

  it('keeps leaders visible with the Grupos de Vida badge', async () => {
    render(<MiEquipoClient {...propsGdv()} />)
    expect(filas()).toHaveLength(grupos)
    expect(within(filas()[0]).getByText('Grupos de Vida')).toBeInTheDocument()
    expect(within(filas()[0]).getByText('Líder de grupo')).toBeInTheDocument()
  })
})

describe('MiEquipoClient — actions menu (criterion 5, second half)', () => {
  const editable = () => propsConexion({ puedeEditar: true })
  const menuDe = (nombre: string) => screen.getByRole('button', { name: `Acciones para ${nombre}` })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('gives every editable row a 44px menu button, and none without write access', () => {
    const { unmount } = render(<MiEquipoClient {...editable()} />)
    expect(screen.getAllByRole('button', { name: /^Acciones para / })).toHaveLength(38)
    expect(menuDe('Luis Barrios')).toHaveClass('h-11', 'w-11')
    unmount()

    render(<MiEquipoClient {...propsConexion()} />)
    expect(screen.queryByRole('button', { name: /^Acciones para / })).not.toBeInTheDocument()
  })

  it('offers only what the API supports: Cambiar etapa and Turnos', async () => {
    render(<MiEquipoClient {...editable()} />)
    await userEvent.click(menuDe('Luis Barrios'))
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Cambiar etapa', 'Turnos'])
  })

  it('leaves Grupos de Vida leaders and terminal estados without a menu', () => {
    const conRetirado: PersonasPorEquipo = {
      ...personasPorEquipoConexion,
      'eq-mdh': personasPorEquipoConexion['eq-mdh'].map((p) => (p.nombre === 'Rayda Alvarado' ? { ...p, estado: 'retirado' as const } : p)),
    }
    const gdv: PersonaEntrada = {
      clave: 'gdv:p:g',
      personaId: personaId('gdv-p'),
      nombre: 'Lider Solo Lectura',
      rolClave: 'lider',
      rolLabel: 'Líder de grupo',
      estado: 'activo',
      origen: 'grupos_vida',
    }
    const personas: PersonasPorEquipo = { ...conRetirado, 'eq-mdh': [...conRetirado['eq-mdh'], gdv] }
    render(<MiEquipoClient {...propsConexion({ puedeEditar: true, vista: vistaDeDireccion(arbolConexion, personas, ID_CONEXION) })} />)
    expect(screen.queryByRole('button', { name: 'Acciones para Rayda Alvarado' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Acciones para Lider Solo Lectura' })).not.toBeInTheDocument()
    expect(menuDe('Edith Pérez')).toBeInTheDocument()
  })

  it('changes a person to Activo from the menu, refreshes, and the strip stops listing them', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ servicio: {}, historial: [] }) })
    global.fetch = fetchMock as unknown as typeof fetch
    const { rerender } = render(<MiEquipoClient {...editable()} />)
    expect(screen.getByRole('region', { name: 'Pendientes' })).toHaveTextContent('Luis Barrios')

    await userEvent.click(menuDe('Luis Barrios'))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Cambiar etapa' }))
    expect(screen.getByText('Etapa actual: En orientación')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Nueva etapa'), 'activo')
    await userEvent.selectOptions(screen.getByLabelText('Motivo'), 'admin_promocion')
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/dream-team/servicios/servicio-dhah-3',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ estado: 'activo', motivo: 'admin_promocion', expectedVersion: 1 }),
      }),
    )
    expect(refresh).toHaveBeenCalledTimes(1)

    // router.refresh() re-renders the page with the server's truth: Luis is Activo now.
    const activada: PersonasPorEquipo = {
      ...personasPorEquipoConexion,
      'eq-dhah': personasPorEquipoConexion['eq-dhah'].map((p) => (p.nombre === 'Luis Barrios' ? { ...p, estado: 'activo' as const } : p)),
    }
    rerender(<MiEquipoClient {...propsConexion({ puedeEditar: true, vista: vistaDeDireccion(arbolConexion, activada, ID_CONEXION) })} />)
    expect(screen.getByRole('region', { name: 'Pendientes' })).not.toHaveTextContent('Luis Barrios')
    expect(screen.getByRole('region', { name: 'Pendientes' })).toHaveTextContent('1 persona espera que la actives')
  })
})

describe('MiEquipoClient — Agregar persona', () => {
  const asignables = [
    { id: ID_CONEXION, etiqueta: 'Dirección de Conexión' },
    { id: 'eq-parejas', etiqueta: '—— Parejas' },
  ]
  const rolesPorEquipo = {
    'eq-parejas': [{ id: 'rol-fac', equipoId: 'eq-parejas', label: 'facilitador', activo: true }],
  }
  const conEdicion = () => propsConexion({ puedeEditar: true, equiposAsignables: asignables, rolesPorEquipo })

  it('is offered only with write access (header button and phone floating button)', () => {
    const { unmount } = render(<MiEquipoClient {...conEdicion()} />)
    expect(screen.getAllByRole('button', { name: 'Agregar persona' })).toHaveLength(2)
    unmount()
    render(<MiEquipoClient {...propsConexion()} />)
    expect(screen.queryByRole('button', { name: 'Agregar persona' })).not.toBeInTheDocument()
  })

  it('opens the assigner with the selected team preselected', async () => {
    render(<MiEquipoClient {...conEdicion()} />)
    await userEvent.click(tarjeta('Parejas'))
    await userEvent.click(screen.getAllByRole('button', { name: 'Agregar persona' })[0])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect((screen.getByLabelText('Equipo') as HTMLSelectElement).value).toBe('eq-parejas')
    expect(within(screen.getByLabelText('Rol')).getByRole('option', { name: 'Facilitador' })).toBeInTheDocument()
  })

  it('preselects nothing while Toda la dirección is selected', async () => {
    render(<MiEquipoClient {...conEdicion()} />)
    await userEvent.click(screen.getAllByRole('button', { name: 'Agregar persona' })[0])
    expect((screen.getByLabelText('Equipo') as HTMLSelectElement).value).toBe('')
  })

  it('refreshes the page once a person is assigned', async () => {
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/dream-team/usuarios/buscar')) {
        return { ok: true, json: async () => [{ id: 'u-1', email: 'nueva@test.com', nombre: 'Nueva', apellido: 'Persona' }] }
      }
      return { ok: true, status: 201, json: async () => ({ servicio: {} }) }
    }) as unknown as typeof fetch
    render(<MiEquipoClient {...conEdicion()} />)
    await userEvent.click(tarjeta('Parejas'))
    await userEvent.click(screen.getAllByRole('button', { name: 'Agregar persona' })[0])
    await userEvent.type(screen.getByLabelText('Buscar persona', { selector: 'input[placeholder*="email"]' }), 'nueva')
    await userEvent.click(await screen.findByRole('button', { name: /Nueva Persona/ }))
    await userEvent.selectOptions(screen.getByLabelText('Rol'), 'rol-fac')
    await userEvent.click(screen.getByRole('button', { name: 'Crear' }))
    expect(refresh).toHaveBeenCalled()
  })
})

describe('MiEquipoClient — shifts', () => {
  const T9 = '00000000-0000-4000-8000-000000000009'
  const TCCS = '00000000-0000-4000-8000-000000000017'
  const turnos = [
    { id: T9, label: 'Domingo 9:00', campusId: 'bqt' },
    { id: TCCS, label: 'Sábado 17:00', campusId: 'ccs' },
  ]
  const conTurno: PersonasPorEquipo = {
    ...personasPorEquipoConexion,
    [ID_CONEXION]: personasPorEquipoConexion[ID_CONEXION].map((p) => ({ ...p, turnoIds: [T9] })),
  }

  it('shows each person\'s shifts, with a dash when none', () => {
    render(<MiEquipoClient {...propsConexion({ vista: vistaDeDireccion(arbolConexion, conTurno, ID_CONEXION), turnos })} />)
    const antholy = filas().find((f) => f.textContent?.includes('Antholy Ludovic Gómez')) as HTMLElement
    expect(within(antholy).getByText('Turno: Domingo 9:00')).toBeInTheDocument()
    const otra = filas().find((f) => f.textContent?.includes('Edmir Muñoz')) as HTMLElement
    expect(within(otra).getByText('Turno: —')).toBeInTheDocument()
  })

  it('the Turno filter offers only the shifts of the campus selected in the app', () => {
    campusActivoId = 'ccs'
    render(<MiEquipoClient {...propsConexion({ turnos })} />)
    const opciones = Array.from((screen.getByLabelText('Turno') as HTMLSelectElement).options).map((o) => o.text)
    expect(opciones).toEqual(['Todos', 'Sábado 17:00', 'Sin turno'])
  })
})

describe('MiEquipoClient — the volunteer coordinator registers new people', () => {
  it('offers Agregar persona to a registrar without write access, and to nobody else', () => {
    const { unmount } = render(<MiEquipoClient {...propsConexion({ puedeRegistrar: true })} />)
    expect(screen.getAllByRole('button', { name: 'Agregar persona' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /^Acciones para / })).not.toBeInTheDocument()
    unmount()

    render(<MiEquipoClient {...propsConexion()} />)
    expect(screen.queryByRole('button', { name: 'Agregar persona' })).not.toBeInTheDocument()
  })
})
