/**
 * `<MiEquipoClient>` — /dream-team/mi-equipo on design system v2 (T7a-3,
 * S11 of odd/tasks/sistema-diseno-v2.md): the header, hero and Dirección
 * selector, the tree walked one level at a time (scope cards, breadcrumbs,
 * phone "‹ padre"; no "Toda la dirección" card), the search by name or phone
 * and the URL.
 *
 * Rewritten from the previous suite (team cards with "Toda la dirección",
 * "Volver a" cards, estado pills over the list, a `<ul>` of people): each case
 * keeps its intent through the new public interface. Filters, views and the
 * person panel live in mi-equipo-client-filtros / -acciones.
 *
 * `ListaResponsiva` renders the desktop cells and the phone cell of every row
 * (CSS swaps them), so rows are found through their "Abrir …" button.
 */
import React from 'react'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { MiEquipoClient, type MiEquipoClientProps } from '@/components/dream-team/mi-equipo/mi-equipo-client'
import { FILTROS_MI_EQUIPO } from '@/lib/platform/dream-team/mi-equipo-filtros'
import { listarDirecciones, vistaDeDireccion, type PersonaEntrada, type PersonasPorEquipo } from '@/lib/platform/dream-team/mi-equipo-vista'
import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { NodoEquipoArbol } from '@/lib/platform/dream-team/estructura-arbol'
import { personaId } from '@/lib/platform/dream-team/types'
import { ID_CONEXION, ID_MDH, arbolConexion, personasPorEquipoConexion } from '@/tests/helpers/mi-equipo-conexion'

const replace = jest.fn()
jest.mock('@/hooks/useCampus', () => ({ useCampus: () => ({ campusId: null }) }))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: jest.fn(), push: jest.fn() }),
  usePathname: () => '/dream-team/mi-equipo',
}))
// PaginaSistema renders DesktopHeader behind React.lazy + Suspense; this double shows the breadcrumbs and actions.
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ titulo, accionPrincipal, breadcrumbs }: { titulo?: string; accionPrincipal?: React.ReactNode; breadcrumbs?: React.ReactNode }) => (
    <header>
      {breadcrumbs}
      {titulo && <h1>{titulo}</h1>}
      {accionPrincipal}
    </header>
  ),
}))

jest.setTimeout(15_000)
let user: ReturnType<typeof userEvent.setup>
beforeEach(() => {
  replace.mockClear()
  user = userEvent.setup({ delay: null })
})

function propsConexion(overrides: Partial<MiEquipoClientProps> = {}): MiEquipoClientProps {
  return {
    direcciones: listarDirecciones(arbolConexion, personasPorEquipoConexion),
    vista: vistaDeDireccion(arbolConexion, personasPorEquipoConexion, ID_CONEXION),
    direccionId: ID_CONEXION,
    rol: 'sin_permisos',
    equiposAsignables: [],
    rolesPorEquipo: {},
    ...overrides,
  }
}

const lista = () => screen.queryByRole('table', { name: /del equipo$/, hidden: true })
const nombres = () => {
  const tabla = lista()
  if (!tabla) return []
  return within(tabla)
    .queryAllByRole('button', { name: /^Abrir /, hidden: true })
    .map((boton) => (boton.getAttribute('aria-label') ?? '').replace(/^Abrir /, ''))
}
const tarjeta = (prefijo: string) =>
  within(screen.getByRole('group', { name: /^(Equipos|Áreas)$/ })).getByRole('button', { name: (n) => n.startsWith(prefijo) })
const migas = () =>
  within(screen.getByRole('navigation', { name: 'Ubicación' }))
    .getAllByRole('listitem')
    .map((li) => li.textContent?.replace('/', ''))
const resumen = () => screen.getByRole('heading', { level: 1 }).nextElementSibling?.textContent
const buscar = () => screen.getByRole('searchbox', { name: 'Buscar en tu equipo' })

describe('MiEquipoClient — header and dirección (criteria 1, 2 and 6)', () => {
  it('has one h1, the hero: the dirección, who leads it and the totals; the breadcrumbs end on it', async () => {
    render(<MiEquipoClient {...propsConexion()} />)
    await screen.findByRole('navigation', { name: 'Ubicación' })
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Dirección de Conexión' })).toHaveClass('text-2xl')
    expect(resumen()).toBe('Dirige Antholy Ludovic Gómez · 38 personas')
    expect(migas()).toEqual(['Dream Team', 'Mi equipo', 'Dirección de Conexión'])
    // On phones the shell holds the h1: the large title is an h2.
    expect(screen.getByRole('heading', { level: 2, name: 'Dirección de Conexión' })).toBeInTheDocument()
  })

  it('offers a Dirección selector to someone who reaches several and navigates by URL', async () => {
    const direcciones = [
      { id: ID_CONEXION, label: 'Dirección de Conexión', total: 38 },
      { id: 'dir-otra', label: 'Dirección de Alabanza', total: 5 },
    ]
    render(<MiEquipoClient {...propsConexion({ direcciones })} />)
    const select = screen.getByLabelText('Dirección')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Dirección de Conexión', 'Dirección de Alabanza'])
    await user.selectOptions(select, 'dir-otra')
    expect(replace).toHaveBeenCalledWith('/dream-team/mi-equipo?direccion=dir-otra', { scroll: false })
  })

  it('shows no selector to someone who reaches a single dirección, nor empty or inactive ones', () => {
    render(<MiEquipoClient {...propsConexion()} />)
    expect(screen.queryByLabelText('Dirección')).not.toBeInTheDocument()
    expect(screen.queryByText(/Dirección Vacía|Dirección Antigua/)).not.toBeInTheDocument()
  })

  it('explains an empty scope instead of rendering a blank screen, on a full-width page', () => {
    const { container } = render(<MiEquipoClient {...propsConexion({ direcciones: [], vista: null })} />)
    expect(screen.getByText('Todavía no hay equipos para mostrar')).toBeInTheDocument()
    expect(screen.getByText('Puede deberse a que aún no te asignaron un área en la estructura de Dream Team.')).toBeInTheDocument()
    expect(container.querySelector('[data-ancho="default"]')).not.toBeNull()
  })
})

describe('MiEquipoClient — scope cards one level at a time (criteria 1 and 3, S11 decision 3)', () => {
  it('shows one card per team with its responsible and flags, no "Toda la dirección", and the 38 people', () => {
    render(<MiEquipoClient {...propsConexion()} />)
    const grupo = screen.getByRole('group', { name: 'Equipos' })
    expect(within(grupo).getAllByRole('button')).toHaveLength(4)
    expect(screen.queryByText('Toda la dirección')).not.toBeInTheDocument()
    expect(tarjeta('De Hombre a Hombre')).toHaveTextContent('Coordina Edmir Muñoz')
    expect(tarjeta('De Hombre a Hombre')).toHaveTextContent('1 por activar')
    expect(tarjeta('Parejas')).not.toHaveTextContent('por activar')
    expect(nombres()).toHaveLength(38)
  })

  it('a team card enters the team: the list narrows, the cards hide, the breadcrumbs and the URL follow', async () => {
    render(<MiEquipoClient {...propsConexion()} />)
    await user.click(tarjeta('Parejas'))
    expect(nombres()).toHaveLength(8)
    expect(nombres()[0]).toBe('Ludovic Gómez')
    expect(screen.queryByRole('group', { name: 'Equipos' })).not.toBeInTheDocument()
    expect(migas()).toEqual(['Dream Team', 'Mi equipo', 'Dirección de Conexión', 'Parejas'])
    expect(resumen()).toBe('Coordina Ludovic Gómez · 8 personas')
    expect(replace).toHaveBeenLastCalledWith('/dream-team/mi-equipo?nivel=eq-parejas', { scroll: false })

    await user.click(within(screen.getByRole('navigation', { name: 'Ubicación' })).getByRole('button', { name: 'Dirección de Conexión' }))
    expect(nombres()).toHaveLength(38)
  })

  it('lists the dirección director only at the dirección level', async () => {
    render(<MiEquipoClient {...propsConexion()} />)
    expect(nombres()).toContain('Antholy Ludovic Gómez')
    await user.click(tarjeta('Mujer de Hoy'))
    expect(nombres()).not.toContain('Antholy Ludovic Gómez')
  })

  it('opens at the level of a shared URL; an unknown level falls back to the dirección', () => {
    const { unmount } = render(<MiEquipoClient {...propsConexion({ filtrosIniciales: { ...FILTROS_MI_EQUIPO, nivel: ID_MDH } })} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Mujer de Hoy' })).toBeInTheDocument()
    expect(nombres()).toHaveLength(6)
    unmount()
    render(<MiEquipoClient {...propsConexion({ filtrosIniciales: { ...FILTROS_MI_EQUIPO, nivel: 'inventado' } })} />)
    expect(nombres()).toHaveLength(38)
  })
})

describe('MiEquipoClient — the tree of Dirección de Niños', () => {
  const nodo = (id: string, label: string, hijos: readonly NodoArbol<NodoEquipoArbol>[] = [], nivel = 0): NodoArbol<NodoEquipoArbol> => ({
    equipo: { origen: 'dream_team', id, label, experiencia: 'talleres_crecimiento', activo: true, responsables: [] },
    hijos,
    nivel,
  })
  const arbolNinos = [
    nodo('ninos', 'Dirección de Niños', [
      nodo('wau', 'Waumbaland', [
        nodo('wau-anf', 'Anfitriones', [], 2),
        nodo('wau-atv', 'Atención al Voluntario', [nodo('wau-rec', 'Recepción', [], 3), nodo('wau-seg', 'Seguimiento', [], 3)], 2),
      ], 1),
      nodo('ups', 'Upstreet', [nodo('ups-anf', 'Anfitriones', [], 2)], 1),
    ]),
  ]
  const entrada = (clave: string, nombre: string, rolClave: string, estado: PersonaEntrada['estado'] = 'activo'): PersonaEntrada => ({
    clave,
    personaId: personaId(`persona-${clave}`),
    nombre,
    rolClave,
    rolLabel: rolClave,
    estado,
    origen: 'dream_team',
    servicioId: `servicio-${clave}`,
    version: 1,
  })
  const personasNinos: PersonasPorEquipo = {
    ninos: [entrada('n1', 'Nina Directora', 'director')],
    wau: [entrada('w1', 'Wanda Coordinadora', 'coordinador'), entrada('w2', 'Walter Facilitador', 'facilitador', 'en_orientacion')],
    'wau-anf': [entrada('wa1', 'Ana Anfitriona', 'facilitador')],
    'wau-rec': [entrada('r1', 'Rita Recepción', 'coordinador')],
    'wau-seg': [entrada('s1', 'Sara Seguimiento', 'facilitador', 'postulado')],
    'ups-anf': [entrada('u1', 'Ursula Upstreet', 'coordinador'), entrada('u2', 'Uriel Upstreet', 'facilitador')],
  }
  const propsNinos = () =>
    propsConexion({
      direcciones: listarDirecciones(arbolNinos, personasNinos),
      vista: vistaDeDireccion(arbolNinos, personasNinos, 'ninos'),
      direccionId: 'ninos',
    })
  const atras = (label: string) => screen.getByRole('button', { name: `Volver a ${label}` })

  it('shows Upstreet and Waumbaland as áreas, no way back at the dirección, and its 8 people', () => {
    render(<MiEquipoClient {...propsNinos()} />)
    const grupo = screen.getByRole('group', { name: 'Áreas' })
    expect(within(grupo).getAllByRole('button').map((b) => b.textContent)).toEqual([
      expect.stringContaining('Upstreet'),
      expect.stringContaining('Waumbaland'),
    ])
    expect(screen.queryByRole('button', { name: /^Volver a / })).not.toBeInTheDocument()
    expect(nombres()).toHaveLength(8)
  })

  it('goes down any depth and back up one level at a time with "‹ padre" (44px)', async () => {
    render(<MiEquipoClient {...propsNinos()} />)
    await user.click(tarjeta('Waumbaland'))
    expect(nombres()).toHaveLength(5)
    expect(nombres()).not.toContain('Nina Directora')
    await user.click(tarjeta('Atención al Voluntario'))
    expect(within(screen.getByRole('group', { name: 'Equipos' })).getAllByRole('button')).toHaveLength(2)
    expect(nombres()).toHaveLength(2)
    expect(migas()).toEqual(['Dream Team', 'Mi equipo', 'Dirección de Niños', 'Waumbaland', 'Atención al Voluntario'])

    expect(atras('Waumbaland')).toHaveClass('min-h-11')
    await user.click(atras('Waumbaland'))
    expect(nombres()).toHaveLength(5)
    await user.click(atras('Dirección de Niños'))
    expect(tarjeta('Upstreet')).toBeInTheDocument()
    expect(nombres()).toHaveLength(8)
  })

  it('changing the dirección starts at its own level', async () => {
    const { rerender } = render(<MiEquipoClient {...propsNinos()} />)
    await user.click(tarjeta('Waumbaland'))
    rerender(<MiEquipoClient {...propsConexion()} />)
    expect(screen.queryByRole('button', { name: /^Volver a / })).not.toBeInTheDocument()
    expect(nombres()).toHaveLength(38)
  })
})

describe('MiEquipoClient — search by name or phone (criterion 4, S11 decision 6)', () => {
  afterEach(() => jest.useRealTimers())

  const conTelefono: PersonasPorEquipo = {
    ...personasPorEquipoConexion,
    [ID_MDH]: personasPorEquipoConexion[ID_MDH].map((p) => (p.nombre === 'Edith Pérez' ? { ...p, telefono: '0414-555-1234' } : p)),
  }

  it('matches names without accents or case; the URL follows after a short debounce', async () => {
    jest.useFakeTimers()
    render(<MiEquipoClient {...propsConexion()} />)
    await user.type(buscar(), 'PEREZ')
    expect(nombres()).toEqual(['Edith Pérez'])
    expect(replace).not.toHaveBeenCalled()
    act(() => {
      jest.advanceTimersByTime(400)
    })
    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenLastCalledWith('/dream-team/mi-equipo?q=PEREZ', { scroll: false })
  })

  it('finds a person by phone however it is typed, and never by a stray digit in a name query', async () => {
    render(<MiEquipoClient {...propsConexion({ vista: vistaDeDireccion(arbolConexion, conTelefono, ID_CONEXION) })} />)
    await user.type(buscar(), '04145551234')
    expect(nombres()).toEqual(['Edith Pérez'])
    await user.clear(buscar())
    await user.type(buscar(), '+58 414 555')
    expect(nombres()).toEqual(['Edith Pérez'])
    await user.clear(buscar())
    await user.type(buscar(), 'edith 4')
    expect(nombres()).toEqual([])
  })

  it('searches inside the entered team and says so when nobody matches', async () => {
    render(<MiEquipoClient {...propsConexion()} />)
    await user.click(tarjeta('Mujer de Hoy'))
    await user.type(buscar(), 'blanca')
    expect(nombres()).toHaveLength(2)
    await user.clear(buscar())
    await user.type(buscar(), 'zzzz')
    expect(screen.getByText('Nadie coincide con estos filtros')).toBeInTheDocument()
    expect(screen.getByText('Quitá alguno o usá «Limpiar todo».')).toBeInTheDocument()
  })
})
