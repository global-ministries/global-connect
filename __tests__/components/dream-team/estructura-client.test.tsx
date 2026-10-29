/**
 * `<EstructuraClient>` — /admin/dream-team/estructura on design system v2
 * (S12 of odd/tasks/sistema-diseno-v2.md; prototype
 * docs/design-system/prototipos/estructura/07-b-escritorio.html), desktop.
 *
 * Replaces the two-pane suite (side tree + team detail): the tree is now a
 * connected box diagram and a box opens the node panel. Kept intents: each
 * team shows its people; the tree folds and unfolds per node with a button
 * named after it; search ignores case and diacritics and reaches folded
 * branches; the selection lives in `?equipo=`; an inactive root is reachable;
 * no team at all → empty state. New: "+n", highlight never hides, problem
 * pills, zoom, keyboard reachability, the "Equipos | Turnos del campus" tabs.
 * jsdom has no matchMedia, so the screen renders its desktop tree.
 */
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { EstructuraClient, type EstructuraClientProps } from '@/components/dream-team/estructura/estructura-client'
import { contarUso } from '@/lib/platform/dream-team/estructura-vista'
import { FILTROS_ESTRUCTURA, crearOrganigrama } from '@/lib/platform/dream-team/estructura-organigrama'
import {
  ID_ATRACCION,
  ID_CONEXION,
  ID_GCP,
  ID_PDP,
  arbolEstructura,
  entradaEstructura,
  rolesPorEquipoEstructura,
  serviciosEstructura,
  talleresEstructura,
} from '@/tests/helpers/estructura-fixture'

const replace = jest.fn()
const refresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh, push: jest.fn() }),
  usePathname: () => '/admin/dream-team/estructura',
}))
jest.mock('@/hooks/useCampus', () => ({ useCampus: () => ({ campusId: null, campusActivo: { nombre: 'Barquisimeto' } }) }))
jest.mock('@/app/(auth)/admin/dream-team/estructura/turnos-actions', () => ({
  crearTurno: jest.fn(),
  cambiarActivoTurno: jest.fn(),
  guardarTurnosEquipo: jest.fn(),
}))
jest.mock('@/app/(auth)/admin/dream-team/estructura/actions', () => ({
  crearEquipo: jest.fn(),
  renombrarEquipo: jest.fn(),
  cambiarActivoEquipo: jest.fn(),
  crearRol: jest.fn(),
  renombrarRol: jest.fn(),
  cambiarActivoRol: jest.fn(),
  cambiarNivelRol: jest.fn(),
}))
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}))
// PaginaSistema renders DesktopHeader behind React.lazy + Suspense; this synchronous double shows the crumbs and actions.
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs, accionPrincipal }: { breadcrumbs?: React.ReactNode; accionPrincipal?: React.ReactNode }) => (
    <header>
      {breadcrumbs}
      {accionPrincipal}
    </header>
  ),
}))

beforeEach(() => {
  replace.mockClear()
  refresh.mockClear()
  window.history.replaceState(null, '', '/admin/dream-team/estructura')
})

function props(overrides: Partial<EstructuraClientProps> = {}): EstructuraClientProps {
  return {
    arbol: arbolEstructura,
    rolesPorEquipo: rolesPorEquipoEstructura,
    uso: contarUso(serviciosEstructura),
    talleres: talleresEstructura,
    equipoId: '',
    puedeEditar: false,
    ...overrides,
  }
}

const lienzo = () => screen.getByRole('region', { name: 'Organigrama, desplazable con las flechas' })
const caja = (nombre: string) => within(lienzo()).getByRole('button', { name: (n) => n.startsWith(`${nombre},`) })
const cajaOpcional = (nombre: string) => within(lienzo()).queryByRole('button', { name: (n) => n.startsWith(`${nombre},`) })
const plegar = (nombre: string) =>
  within(lienzo()).getByRole('button', { name: (n) => n === `Contraer ${nombre}` || n.includes(`dentro de ${nombre}`) })

describe('the org chart diagram', () => {
  it('shows the campus box and the open direcciones, deeper branches folded with "+n"', () => {
    render(<EstructuraClient {...props()} />)
    expect(within(lienzo()).getByText('Barquisimeto')).toBeInTheDocument()
    expect(caja('Dirección de Conexión')).toHaveTextContent('38')
    expect(caja('Grupos de Corto Plazo')).toBeInTheDocument()
    expect(cajaOpcional('Punto de Partida')).toBeNull()
    const toggle = plegar('Grupos de Corto Plazo')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveTextContent('+4')
    expect(plegar('Dirección de Conexión')).toHaveAttribute('aria-expanded', 'true')
    // Inactive roots are there too (a dashed box), folded.
    expect(caja('Dirección de Atracción')).toBeInTheDocument()
  })

  it('folds and unfolds one branch with its toggle, and remembers it in the URL', async () => {
    render(<EstructuraClient {...props()} />)
    await userEvent.click(plegar('Grupos de Corto Plazo'))
    expect(caja('Punto de Partida')).toBeInTheDocument()
    expect(plegar('Grupos de Corto Plazo')).toHaveAttribute('aria-expanded', 'true')
    expect(window.location.search).toContain(`expandidos=`)
    expect(decodeURIComponent(window.location.search)).toContain(ID_GCP)
    await userEvent.click(plegar('Dirección de Conexión'))
    expect(cajaOpcional('Grupos de Corto Plazo')).toBeNull()
    expect(replace).not.toHaveBeenCalled()
  })

  it('opens every branch with "Expandir todo" and folds them all with "Contraer"', async () => {
    render(<EstructuraClient {...props()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Expandir todo' }))
    expect(caja('Punto de Partida')).toBeInTheDocument()
    expect(caja('Inside Out')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Contraer' }))
    expect(cajaOpcional('Grupos de Corto Plazo')).toBeNull()
    expect(caja('Dirección de Conexión')).toBeInTheDocument()
  })

  it('starts from the branches in the URL', () => {
    render(<EstructuraClient {...props({ filtros: { ...FILTROS_ESTRUCTURA, expandidos: [] } })} />)
    expect(cajaOpcional('Grupos de Corto Plazo')).toBeNull()
  })
})

describe('search and problem pills highlight, never hide', () => {
  it('lights the match (ignoring case and diacritics) inside a folded branch and keeps every other box', async () => {
    render(<EstructuraClient {...props()} />)
    const antes = within(lienzo()).getAllByRole('button').length
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar en el organigrama' }), 'PUNTO de partída')
    expect(caja('Punto de Partida')).toHaveClass('border-brand')
    expect(caja('Dirección de Conexión')).toHaveClass('border-dashed')
    expect(within(lienzo()).getAllByRole('button').length).toBeGreaterThan(antes)
    expect(screen.getByRole('status')).toHaveTextContent('1 equipo resaltado')
  })

  it('says so when nothing matches, still showing the chart', async () => {
    render(<EstructuraClient {...props()} />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar en el organigrama' }), 'zzz')
    expect(screen.getByRole('status')).toHaveTextContent('Ningún equipo resaltado')
    expect(caja('Dirección de Conexión')).toBeInTheDocument()
  })

  it('offers one pill per problem with its count; pressing one lights those boxes, pressing it again clears', async () => {
    const { conteos } = crearOrganigrama(entradaEstructura())
    render(<EstructuraClient {...props()} />)
    const grupo = within(screen.getByRole('group', { name: 'Resaltar en el organigrama' }))
    const pastilla = grupo.getByRole('button', { name: `Roles sin asignar ${conteos.roles_sin_asignar}` })
    expect(grupo.getByRole('button', { name: `Inactivos ${conteos.inactivo}` })).toBeInTheDocument()
    await userEvent.click(pastilla)
    expect(pastilla).toHaveAttribute('aria-pressed', 'true')
    expect(caja('Dirección de Conexión')).toHaveClass('border-brand')
    expect(window.location.search).toContain('problema=roles_sin_asignar')
    await userEvent.click(pastilla)
    expect(pastilla).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText(/resaltado/)).toBeNull()
  })

  it('starts highlighted from the URL', () => {
    render(<EstructuraClient {...props({ filtros: { ...FILTROS_ESTRUCTURA, problema: 'inactivo' } })} />)
    expect(caja('Dirección de Atracción')).toHaveClass('border-brand')
  })
})

describe('opening a box', () => {
  it('opens the node panel and writes ?equipo= through the router', async () => {
    render(<EstructuraClient {...props()} />)
    await userEvent.click(caja('Dirección de Conexión'))
    expect(replace).toHaveBeenCalledWith(`/admin/dream-team/estructura?equipo=${ID_CONEXION}`, { scroll: false })
    const panel = screen.getByRole('dialog', { name: 'Dirección de Conexión' })
    expect(panel).toHaveClass('sm:max-w-[560px]')
  })

  it('opens the panel of the node in the URL, its folded ancestors open and the box marked', () => {
    render(<EstructuraClient {...props({ equipoId: ID_PDP })} />)
    expect(screen.getByRole('dialog', { name: 'Punto de Partida' })).toBeInTheDocument()
    // The modal panel hides the page from assistive tech while it is open.
    const fondo = within(screen.getByRole('region', { name: 'Organigrama', hidden: true }))
    expect(fondo.getByRole('button', { name: (n) => n.startsWith('Punto de Partida,'), hidden: true })).toHaveAttribute('aria-current', 'true')
  })

  it('accepts an inactive root', () => {
    render(<EstructuraClient {...props({ equipoId: ID_ATRACCION })} />)
    expect(screen.getByRole('dialog', { name: 'Dirección de Atracción' })).toBeInTheDocument()
  })

  it('drops ?equipo= when the panel closes', async () => {
    render(<EstructuraClient {...props({ equipoId: ID_CONEXION })} />)
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(window.location.search).not.toContain('equipo=')
    expect(caja('Dirección de Conexión')).not.toHaveAttribute('aria-current')
  })
})

describe('keyboard and zoom', () => {
  it('reaches the canvas, then each box and its toggle in tree order', async () => {
    render(<EstructuraClient {...props()} />)
    lienzo().focus()
    expect(lienzo()).toHaveFocus()
    await userEvent.tab()
    expect(caja('Dirección de Conexión')).toHaveFocus()
    await userEvent.tab()
    expect(plegar('Dirección de Conexión')).toHaveFocus()
    await userEvent.tab()
    expect(caja('Grupos de Corto Plazo')).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('dialog', { name: 'Grupos de Corto Plazo' })).toBeInTheDocument()
  })

  it('pans with the arrow keys on the canvas', async () => {
    render(<EstructuraClient {...props()} />)
    const scrollBy = jest.fn()
    lienzo().scrollBy = scrollBy
    lienzo().focus()
    await userEvent.keyboard('{ArrowRight}{ArrowDown}')
    expect(scrollBy).toHaveBeenNthCalledWith(1, { left: 48, top: 0 })
    expect(scrollBy).toHaveBeenNthCalledWith(2, { left: 0, top: 48 })
  })

  it('zooms between 80 % and 120 %, and "Ajustar" fits again', async () => {
    render(<EstructuraClient {...props()} />)
    const zoom = within(screen.getByRole('group', { name: 'Zoom y ramas' }))
    expect(zoom.getByText('100 %')).toBeInTheDocument()
    await userEvent.click(zoom.getByRole('button', { name: 'Alejar' }))
    await userEvent.click(zoom.getByRole('button', { name: 'Alejar' }))
    expect(zoom.getByText('80 %')).toBeInTheDocument()
    expect(zoom.getByRole('button', { name: 'Alejar' })).toBeDisabled()
    for (let i = 0; i < 4; i += 1) await userEvent.click(zoom.getByRole('button', { name: 'Acercar' }))
    expect(zoom.getByText('120 %')).toBeInTheDocument()
    expect(zoom.getByRole('button', { name: 'Acercar' })).toBeDisabled()
    await userEvent.click(zoom.getByRole('button', { name: 'Ajustar' }))
    expect(zoom.getByText('100 %')).toBeInTheDocument()
  })

  it('has a legend of the health dots and the inactive box: floating from lg, under the canvas below it', () => {
    render(<EstructuraClient {...props()} />)
    const [flotante, debajo] = screen.getAllByRole('list', { name: 'Leyenda' })
    expect(flotante).toHaveClass('hidden', 'lg:flex', 'absolute')
    expect(debajo).toHaveClass('lg:hidden')
    for (const leyenda of [flotante, debajo]) {
      for (const texto of ['Sin responsable', 'Roles sin asignar', 'Sin turno', 'Inactivo']) expect(within(leyenda).getByText(texto)).toBeInTheDocument()
    }
  })
})

describe('page frame', () => {
  it('has the breadcrumbs, the hero with the summary and the tabs', () => {
    const { resumen } = crearOrganigrama(entradaEstructura())
    render(<EstructuraClient {...props()} />)
    expect(screen.getByRole('navigation', { name: 'Ubicación' })).toHaveTextContent('Dream Team/Estructura')
    expect(screen.getByRole('heading', { level: 1, name: 'Estructura' })).toBeInTheDocument()
    expect(screen.getAllByText(/equipos activos/)[0].closest('p')).toHaveTextContent(
      `${resumen.direcciones} direcciones · ${resumen.equiposActivos} equipos activos · ${resumen.personas} personas sirviendo`,
    )
    expect(screen.getByRole('tab', { name: 'Equipos' })).toHaveAttribute('aria-selected', 'true')
  })

  it('switches to "Turnos del campus" and keeps it in the URL', async () => {
    render(<EstructuraClient {...props({ turnos: { campus: [{ id: 'c1', nombre: 'Barquisimeto' }], turnos: [], propiosPorEquipo: {} } })} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Turnos del campus' }))
    expect(screen.getByRole('region', { name: 'Turnos del campus' })).toBeInTheDocument()
    expect(window.location.search).toBe('?tab=turnos')
  })

  it('renders the empty state when the caller reaches no team', () => {
    render(<EstructuraClient {...props({ arbol: [] })} />)
    expect(screen.getByText('No se encontraron equipos')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })
})
