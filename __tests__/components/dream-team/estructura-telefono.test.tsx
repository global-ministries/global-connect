/**
 * `<EstructuraClient>` on a phone (< 768px; S12 of odd/tasks/sistema-diseno-v2.md,
 * prototype docs/design-system/prototipos/estructura/08-b-celular.html).
 *
 * Replaces the full-screen "Organigrama" overlay suite: the phone page IS the
 * org chart now, vertical and indented, and a box opens the node panel as a
 * bottom sheet. Kept intents: no desktop-only control on the phone, and the
 * floating "Agregar subequipo" is only for whoever edits the structure and
 * never creates under Grupos de Vida.
 */
import React from 'react'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { EstructuraClient, type EstructuraClientProps } from '@/components/dream-team/estructura/estructura-client'
import { contarUso } from '@/lib/platform/dream-team/estructura-vista'
import {
  ID_CONEXION,
  ID_GCP,
  ID_GDV_GRUPO,
  arbolEstructura,
  rolesPorEquipoEstructura,
  serviciosEstructura,
  talleresEstructura,
} from '@/tests/helpers/estructura-fixture'
import { crearEquipo } from '@/app/(auth)/admin/dream-team/estructura/actions'

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
jest.mock('@/components/ui/desktop-header', () => ({ DesktopHeader: () => null }))

const matchMediaOriginal = window.matchMedia
beforeEach(() => {
  replace.mockClear()
  refresh.mockClear()
  jest.mocked(crearEquipo).mockResolvedValue({ ok: true } as never)
  window.history.replaceState(null, '', '/admin/dream-team/estructura')
  window.matchMedia = jest.fn((consulta: string) => ({
    matches: false,
    media: consulta,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })) as unknown as typeof window.matchMedia
})
afterEach(() => {
  window.matchMedia = matchMediaOriginal
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

const organigrama = () => screen.getByRole('region', { name: 'Organigrama' })
const caja = (nombre: string) => within(organigrama()).getByRole('button', { name: (n) => n.startsWith(`${nombre},`) })
const cajaOpcional = (nombre: string) => within(organigrama()).queryByRole('button', { name: (n) => n.startsWith(`${nombre},`) })
const plegar = (nombre: string) =>
  within(organigrama()).getByRole('button', { name: (n) => n === `Contraer ${nombre}` || n.includes(`dentro de ${nombre}`) })
/** The FAB, not the panel's own "Agregar subequipo" (a closed sheet stays mounted under jsdom). */
const fab = () =>
  screen.queryAllByRole('button', { name: 'Agregar subequipo', hidden: true }).find((boton) => !boton.closest('[role="dialog"]')) ?? null

/** Escape closes the sheet; vaul keeps it mounted (closed) for its exit under jsdom. */
async function cerrarHoja(nombre: string) {
  const hoja = screen.getByRole('dialog', { name: nombre })
  fireEvent.keyDown(hoja, { key: 'Escape' })
  await waitFor(() => expect(hoja).toHaveAttribute('data-state', 'closed'))
}

describe('the phone org chart', () => {
  it('is the vertical chart: campus box, indented boxes, no canvas, zoom or legend', () => {
    render(<EstructuraClient {...props()} />)
    expect(within(organigrama()).getByText('Barquisimeto')).toBeInTheDocument()
    expect(caja('Dirección de Conexión')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Organigrama, desplazable con las flechas' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Zoom y ramas' })).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Leyenda' })).not.toBeInTheDocument()
    // Deeper levels are nested lists under their parent.
    expect(caja('Grupos de Corto Plazo').closest('ul')?.closest('li')).toContainElement(caja('Dirección de Conexión'))
  })

  it('folds with "+n" toggles and unfolds everything with "Expandir todo"', async () => {
    render(<EstructuraClient {...props()} />)
    const toggle = plegar('Grupos de Corto Plazo')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveTextContent('+4')
    await userEvent.click(toggle)
    expect(caja('Punto de Partida')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Contraer todo' }))
    expect(cajaOpcional('Grupos de Corto Plazo')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Expandir todo' }))
    expect(caja('Inside Out')).toBeInTheDocument()
  })

  it('keeps the search and the problem pills', () => {
    render(<EstructuraClient {...props()} />)
    expect(screen.getByRole('searchbox', { name: 'Buscar en el organigrama' })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Resaltar en el organigrama' })).getAllByRole('button')).toHaveLength(4)
  })

  it('opens a box as a bottom sheet and writes ?equipo=', async () => {
    render(<EstructuraClient {...props()} />)
    await userEvent.click(caja('Dirección de Conexión'))
    expect(replace).toHaveBeenCalledWith(`/admin/dream-team/estructura?equipo=${ID_CONEXION}`, { scroll: false })
    expect(screen.getByRole('dialog', { name: 'Dirección de Conexión' })).toHaveAttribute('data-slot', 'drawer-content')
  })
})

describe('the floating "Agregar subequipo" button', () => {
  it('is not there for a read-only viewer', () => {
    render(<EstructuraClient {...props({ puedeEditar: false })} />)
    expect(fab()).not.toBeInTheDocument()
  })

  it('is phone-only, and without an open node asks where to create it, Grupos de Vida and inactive teams left out', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props({ puedeEditar: true })} />)
    expect(fab()).toHaveClass('md:hidden')
    await user.click(fab() as HTMLElement)
    const selector = within(screen.getByRole('dialog', { name: 'Agregar subequipo' }))
    const opciones = selector.getAllByRole('button').map((boton) => boton.textContent)
    expect(opciones).toContain('Grupos de Corto Plazo')
    expect(opciones).not.toContain('Segmento Hombres')
    expect(opciones).not.toContain('Dirección de Atracción')
    // vaul's drag handling needs pointer capture, which jsdom lacks: a plain click.
    fireEvent.click(selector.getByRole('button', { name: 'Grupos de Corto Plazo' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Agregar subequipo' })
    await user.type(within(dialogo).getByLabelText('Nombre del subequipo'), 'Solteros')
    await user.click(within(dialogo).getByRole('button', { name: 'Crear' }))
    await waitFor(() => expect(crearEquipo).toHaveBeenCalledWith({ parentEquipoId: ID_GCP, label: 'Solteros' }))
    expect(refresh).toHaveBeenCalled()
  })

  it('creates inside the last opened node when it is editable', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props({ puedeEditar: true, equipoId: ID_GCP })} />)
    await cerrarHoja('Grupos de Corto Plazo')
    await user.click(fab() as HTMLElement)
    const dialogo = await screen.findByRole('dialog', { name: 'Agregar subequipo' })
    expect(dialogo).toHaveTextContent('Se creará dentro de «Grupos de Corto Plazo».')
  })

  it('never creates under a Grupos de Vida node: it asks where instead', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props({ puedeEditar: true, equipoId: ID_GDV_GRUPO })} />)
    await cerrarHoja('Grupo Alfa')
    await user.click(fab() as HTMLElement)
    expect(await screen.findByRole('dialog', { name: 'Agregar subequipo' })).toHaveTextContent('Elegí dentro de qué equipo crearlo.')
  })

  it('becomes "Agregar turno" on the shifts tab', async () => {
    render(
      <EstructuraClient
        {...props({ puedeEditar: true, turnos: { campus: [{ id: 'c1', nombre: 'Barquisimeto' }], turnos: [], propiosPorEquipo: {} } })}
      />,
    )
    await userEvent.click(screen.getByRole('tab', { name: 'Turnos del campus' }))
    expect(fab()).not.toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Agregar turno' }).at(-1) as HTMLElement)
    expect(screen.getByRole('dialog', { name: 'Agregar turno' })).toBeInTheDocument()
  })
})
