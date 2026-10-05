/**
 * `<EstructuraClient>` on phones (criterion 7 of
 * odd/tasks/dream-team-estructura-rediseno.md): below `lg` the page is the
 * team detail; a top "Organigrama" button opens the tree full-screen with its
 * search and a close button, and choosing a team goes back to the detail.
 * "Agregar sub-equipo" becomes the system's floating button.
 *
 * jsdom applies no media queries, so what only exists on one width is checked
 * through the responsive classes that hide it on the other.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { EstructuraClient, type EstructuraClientProps } from '@/components/dream-team/estructura/estructura-client'
import { contarUso } from '@/lib/platform/dream-team/estructura-vista'
import {
  ID_DHAH,
  ID_GDV_GRUPO,
  ID_PAREJAS,
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
}))

// The shift cards (turnos-*.tsx) import their own server actions.
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
}))

jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}))

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
  replace.mockClear()
  refresh.mockClear()
  jest.mocked(crearEquipo).mockResolvedValue({ ok: true } as never)
  window.localStorage.clear()
})

function props(overrides: Partial<EstructuraClientProps> = {}): EstructuraClientProps {
  return {
    arbol: arbolEstructura,
    rolesPorEquipo: rolesPorEquipoEstructura,
    uso: contarUso(serviciosEstructura),
    talleres: talleresEstructura,
    equipoId: ID_DHAH,
    puedeEditar: false,
    ...overrides,
  }
}

const botonOrganigrama = () => screen.getByRole('button', { name: 'Organigrama' })
const detalle = () => screen.getByRole('region', { name: 'Detalle del equipo' })

describe('the organigrama button (criterion 7)', () => {
  it('sits above the detail, only below lg, and starts closed', () => {
    render(<EstructuraClient {...props()} />)
    expect(botonOrganigrama()).toHaveClass('lg:hidden')
    expect(botonOrganigrama()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(detalle()).getByRole('heading', { name: 'De Hombre a Hombre', level: 2 })).toBeInTheDocument()
  })

  it('opens the tree full-screen with search, rows and a close button', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props()} />)
    await user.click(botonOrganigrama())

    const dialogo = await screen.findByRole('dialog', { name: 'Organigrama' })
    expect(dialogo).toHaveClass('h-dvh', 'w-screen')
    // The open dialog hides the page behind it from the accessibility tree.
    expect(screen.getByRole('button', { name: 'Organigrama', hidden: true })).toHaveAttribute('aria-expanded', 'true')
    expect(within(dialogo).getByRole('searchbox', { name: 'Buscar equipo' })).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: /^Dirección de Conexión/ })).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: /^De Hombre a Hombre/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialogo).getByRole('button', { name: /Inactivas · 2/ })).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Cerrar el organigrama' })).toBeInTheDocument()
  })

  it('searches inside the full-screen tree', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props()} />)
    await user.click(botonOrganigrama())
    const dialogo = await screen.findByRole('dialog', { name: 'Organigrama' })
    await user.type(within(dialogo).getByRole('searchbox', { name: 'Buscar equipo' }), 'parejas')
    expect(within(dialogo).getByRole('button', { name: /^Parejas/ })).toBeInTheDocument()
    expect(within(dialogo).queryByRole('button', { name: /^Mujer de Hoy/ })).not.toBeInTheDocument()
  })

  it('goes back to the detail of the team that was chosen, with the search cleared', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props()} />)
    await user.click(botonOrganigrama())
    const dialogo = await screen.findByRole('dialog', { name: 'Organigrama' })
    await user.type(within(dialogo).getByRole('searchbox', { name: 'Buscar equipo' }), 'parejas')
    await user.click(within(dialogo).getByRole('button', { name: /^Parejas/ }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(replace).toHaveBeenCalledWith(`?equipo=${ID_PAREJAS}`, { scroll: false })
    expect(within(detalle()).getByRole('heading', { name: 'Parejas', level: 2 })).toBeInTheDocument()

    await user.click(botonOrganigrama())
    const reabierto = await screen.findByRole('dialog', { name: 'Organigrama' })
    expect(within(reabierto).getByRole('searchbox', { name: 'Buscar equipo' })).toHaveValue('')
  })

  it('closes with its own button and keeps the team', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props()} />)
    await user.click(botonOrganigrama())
    const dialogo = await screen.findByRole('dialog', { name: 'Organigrama' })
    await user.click(within(dialogo).getByRole('button', { name: 'Cerrar el organigrama' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
    expect(within(detalle()).getByRole('heading', { name: 'De Hombre a Hombre', level: 2 })).toBeInTheDocument()
  })

  it('offers one close button only', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props()} />)
    await user.click(botonOrganigrama())
    const dialogo = await screen.findByRole('dialog', { name: 'Organigrama' })
    expect(within(dialogo).getAllByRole('button', { name: /^(Cerrar|Close)/ })).toHaveLength(1)
  })
})

describe('desktop-only controls stay off the phone', () => {
  it('hides the side pane and, once closed, its rail below lg', () => {
    const { unmount } = render(<EstructuraClient {...props()} />)
    const panel = screen.getByRole('complementary', { name: 'Organigrama' })
    expect(panel).toHaveClass('hidden', 'lg:flex')
    unmount()

    window.localStorage.setItem('dream-team:estructura:panel', 'cerrado')
    render(<EstructuraClient {...props()} />)
    const rail = screen.getByRole('button', { name: 'Abrir el organigrama' }).parentElement
    expect(rail).toHaveClass('hidden', 'lg:flex')
  })
})

describe('the floating "Agregar sub-equipo" button', () => {
  const botones = () => screen.getAllByRole('button', { name: 'Agregar sub-equipo' })

  it('exists only below md for an editor, next to the header button that takes over from md', () => {
    render(<EstructuraClient {...props({ puedeEditar: true })} />)
    const [cabecera, flotante] = [
      within(detalle()).getByRole('button', { name: 'Agregar sub-equipo' }),
      botones().find((boton) => !detalle().contains(boton)) as HTMLElement,
    ]
    expect(cabecera).toHaveClass('hidden', 'md:inline-flex')
    expect(flotante).toHaveClass('md:hidden', 'fixed')
  })

  it('opens the same dialog and creates the sub-equipo', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props({ puedeEditar: true })} />)
    await user.click(botones().find((boton) => !detalle().contains(boton)) as HTMLElement)
    const dialogo = await screen.findByRole('dialog', { name: 'Agregar sub-equipo' })
    await user.type(within(dialogo).getByLabelText('Nombre del sub-equipo'), 'Solteros')
    await user.click(within(dialogo).getByRole('button', { name: 'Crear' }))
    expect(crearEquipo).toHaveBeenCalledWith({ parentEquipoId: ID_DHAH, label: 'Solteros' })
    expect(refresh).toHaveBeenCalled()
  })

  it('is not there for a read-only viewer', () => {
    render(<EstructuraClient {...props({ puedeEditar: false })} />)
    expect(screen.queryAllByRole('button', { name: 'Agregar sub-equipo' })).toHaveLength(0)
  })

  it('is not there on a Grupos de Vida node, whoever looks', () => {
    render(<EstructuraClient {...props({ puedeEditar: true, equipoId: ID_GDV_GRUPO })} />)
    expect(screen.queryAllByRole('button', { name: 'Agregar sub-equipo' })).toHaveLength(0)
  })
})
