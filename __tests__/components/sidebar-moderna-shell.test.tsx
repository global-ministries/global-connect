import { act, fireEvent, render, screen, within } from '@testing-library/react'

import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { SidebarModerna } from '@/components/ui/sidebar-moderna'
import type { PlatformSession } from '@/lib/platform/session/types'

/**
 * The desktop and tablet sidebar of the app shell (odd/tasks/sistema-diseno-v2.md,
 * S9; prototype design/app-shell): section headers, the accordion, the
 * automatic rail between md and lg with its flyouts, the opaque surface, and
 * the skip link of the shell.
 */

let currentPathname = '/dashboard'
let currentRoles: string[] = ['admin']
let currentSupportCapabilities: string[] = []
let currentPlatformSession: PlatformSession | null = null
const refresh = jest.fn()
let campusDisponibles: { id: string; nombre: string }[] = []

jest.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
  useRouter: () => ({ push: jest.fn(), refresh }),
}))
jest.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    usuario: { id: 'usuario-1', nombre: 'Ana', apellido: 'Pérez', foto_perfil_url: null },
    roles: currentRoles,
    supportCapabilities: currentSupportCapabilities,
    platformSession: currentPlatformSession,
    loading: false,
    error: null,
  }),
}))
jest.mock('@/hooks/useBranding', () => ({ useBranding: () => ({ logoLightUrl: null, logoDarkUrl: null }) }))
jest.mock('@/hooks/useCampus', () => ({
  useCampus: () => ({
    campusActivo: campusDisponibles[0] ?? null,
    localidadActiva: null,
    campusDisponibles,
    localidadesDisponibles: [],
    campusId: null,
    localidadId: null,
    esSuperadmin: false,
    loading: false,
    seleccionarCampus: jest.fn(),
    seleccionarLocalidad: jest.fn(),
  }),
}))
jest.mock('@/lib/actions/auth.actions', () => ({ logout: jest.fn() }))
jest.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light', setTheme: jest.fn() }) }))
jest.mock('@/lib/platform/talleres/flags', () => ({
  isTalleresEnabled: () => false,
  getTalleresFlags: () => ({ enabled: false, stage: 'off', killSwitch: false, minAppVersion: null }),
  getTalleresStage: () => 'off',
  getTalleresStageGate: () => false,
  parseFlag: (value: string | undefined | null) => value === 'true' || value === 'on' || value === '1' || value === 'yes',
}))

const dreamTeamSession: PlatformSession = {
  personaId: 'persona-1',
  subjectAuthId: 'auth-1',
  globalRoles: [],
  contexts: [],
  capabilities: [{ key: 'dream_team.org.manage', experience: 'dream_team', scopeType: 'experience', source: 'manual' }],
}

/** Answers the sidebar's media queries as a viewport of this width would. */
function simularAncho(ancho: number) {
  window.matchMedia = jest.fn((query: string) => {
    const max = /max-width:\s*([\d.]+)px/.exec(query)
    const min = /min-width:\s*([\d.]+)px/.exec(query)
    const matches = (!max || ancho <= Number(max[1])) && (!min || ancho >= Number(min[1]))
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    } as unknown as MediaQueryList
  }) as typeof window.matchMedia
}

const matchMediaOriginal = window.matchMedia
const envOriginal = { ...process.env }

beforeEach(() => {
  currentPathname = '/dashboard'
  currentRoles = ['admin']
  currentSupportCapabilities = []
  currentPlatformSession = null
  campusDisponibles = []
  refresh.mockReset()
  window.localStorage.clear()
  simularAncho(1440)
  process.env = { ...envOriginal }
})

afterEach(() => {
  window.matchMedia = matchMediaOriginal
})

afterAll(() => {
  process.env = envOriginal
})

function navegacion() {
  return screen.getByRole('navigation', { name: 'Navegación principal', hidden: true })
}

describe('sections', () => {
  it('heads Ministerios and Administración for an admin, in that order, with Dream Team between them', () => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
    currentPlatformSession = dreamTeamSession
    render(<SidebarModerna />)
    const nav = navegacion()

    expect(within(nav).getAllByRole('heading', { level: 2, hidden: true }).map((h) => h.textContent)).toEqual([
      'Ministerios',
      'Administración',
    ])
    const ministerios = within(nav).getByRole('group', { name: 'Ministerios', hidden: true })
    const administracion = within(nav).getByRole('group', { name: 'Administración', hidden: true })
    expect(within(ministerios).getByRole('link', { name: 'Grupos de Vida', hidden: true })).toBeInTheDocument()
    expect(within(administracion).getByRole('link', { name: 'Usuarios', hidden: true })).toBeInTheDocument()
    expect(within(administracion).getByRole('link', { name: 'Configuración', hidden: true })).toBeInTheDocument()

    // Inicio has no header; Dream Team is a group entry after Ministerios, before Administración.
    const enlaces = within(nav).getAllByRole('link', { hidden: true }).map((a) => a.textContent)
    expect(enlaces[0]).toBe('Inicio')
    expect(enlaces.indexOf('Dream Team')).toBeGreaterThan(enlaces.lastIndexOf('Grupos de Vida'))
    expect(enlaces.indexOf('Dream Team')).toBeLessThan(enlaces.indexOf('Usuarios'))
    expect(screen.getByRole('button', { name: /submenú de Dream Team/, hidden: true })).toBeInTheDocument()
  })

  it('shows a member only Ministerios', () => {
    currentRoles = ['miembro']
    render(<SidebarModerna />)

    expect(within(navegacion()).getAllByRole('heading', { level: 2, hidden: true }).map((h) => h.textContent)).toEqual([
      'Ministerios',
    ])
  })

  it('heads Administración for support staff with only the support queue', () => {
    currentRoles = ['miembro']
    currentSupportCapabilities = ['support.view']
    render(<SidebarModerna />)

    const administracion = within(navegacion()).getByRole('group', { name: 'Administración', hidden: true })
    expect(within(administracion).getAllByRole('link', { hidden: true }).map((a) => a.textContent)).toEqual(['Cola de soporte'])
  })

  it('keeps Actualizaciones and Ayuda in the footer and leaves theme, profile and sign-out to the account menu', () => {
    render(<SidebarModerna />)
    const raiz = navegacion().parentElement as HTMLElement

    expect(within(raiz).getByRole('link', { name: 'Actualizaciones', hidden: true })).toHaveAttribute('href', '/actualizaciones')
    expect(within(raiz).getByRole('link', { name: 'Ayuda', hidden: true })).toHaveAttribute('href', '/ayuda')
    expect(within(raiz).queryByRole('link', { name: /Mi Perfil/i, hidden: true })).not.toBeInTheDocument()
    expect(within(raiz).queryByRole('button', { name: /Cerrar sesión/i, hidden: true })).not.toBeInTheDocument()
    expect(within(raiz).queryByRole('button', { name: /modo|tema/i, hidden: true })).not.toBeInTheDocument()
  })

  it('is an opaque surface: no glass, no bouncing pill', () => {
    currentPathname = '/users'
    render(<SidebarModerna />)
    const raiz = navegacion().parentElement as HTMLElement

    expect(raiz).toHaveClass('bg-sidebar', 'border-sidebar-border')
    expect(raiz.outerHTML).not.toMatch(/glass|animate-bounce-spring/)
    expect(within(raiz).getByRole('link', { name: 'Usuarios', hidden: true })).toHaveClass('bg-brand-tint', 'text-foreground')
  })

  it('puts the campus selector right under the logo', () => {
    campusDisponibles = [{ id: 'c1', nombre: 'Barquisimeto' }, { id: 'c2', nombre: 'Cabudare' }]
    render(<SidebarModerna />)
    const raiz = navegacion().parentElement as HTMLElement

    const campus = within(raiz).getByRole('combobox', { name: 'Seleccionar campus', hidden: true })
    expect(campus.compareDocumentPosition(navegacion()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(campus).toHaveClass('min-h-11')
  })
})

describe('accordion', () => {
  it('opens the group of the current page by itself', () => {
    currentPathname = '/configuracion/soporte'
    currentSupportCapabilities = ['support.manage']
    render(<SidebarModerna />)

    expect(screen.getByRole('button', { name: 'Cerrar submenú de Configuración', hidden: true })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Abrir submenú de Grupos de Vida', hidden: true })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('link', { name: 'Configuración de soporte', hidden: true })).toHaveAttribute('aria-current', 'page')
  })

  it('keeps only one group open at a time', () => {
    currentPathname = '/grupos-vida/mapa'
    render(<SidebarModerna />)

    const grupos = screen.getByRole('button', { name: 'Cerrar submenú de Grupos de Vida', hidden: true })
    expect(grupos).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Abrir submenú de Configuración', hidden: true }))

    expect(screen.getByRole('button', { name: 'Cerrar submenú de Configuración', hidden: true })).toHaveAttribute('aria-expanded', 'true')
    const gruposCerrado = screen.getByRole('button', { name: 'Abrir submenú de Grupos de Vida', hidden: true })
    expect(gruposCerrado).toHaveAttribute('aria-expanded', 'false')
    // A closed submenu stays in the tree for the transition but is inert.
    const submenu = document.getElementById(gruposCerrado.getAttribute('aria-controls') as string)
    expect(submenu).toHaveAttribute('inert')
    expect(submenu).toHaveClass('max-h-0')
  })

  it('closes the open group from its own chevron', () => {
    currentPathname = '/grupos-vida/mapa'
    render(<SidebarModerna />)

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar submenú de Grupos de Vida', hidden: true }))

    expect(screen.getByRole('button', { name: 'Abrir submenú de Grupos de Vida', hidden: true })).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('rail', () => {
  it('turns into the icon rail between md and lg, with no manual toggle', () => {
    simularAncho(900)
    currentPathname = '/grupos-vida/mapa'
    render(<SidebarModerna />)
    const raiz = navegacion().parentElement as HTMLElement

    expect(raiz).toHaveClass('w-16')
    expect(screen.queryByRole('button', { name: /(Contraer|Expandir) menú/, hidden: true })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Usuarios', hidden: true })).toHaveAttribute('aria-label', 'Usuarios')
    // Groups are one button each; their pages are not in the rail itself.
    expect(screen.getByRole('button', { name: 'Grupos de Vida, contiene la página actual', hidden: true })).toHaveClass('bg-brand-tint')
    expect(screen.queryByRole('link', { name: 'Mapa', hidden: true })).not.toBeInTheDocument()
    // Section headers stay as the groups' names for assistive tech.
    expect(within(navegacion()).getByRole('group', { name: 'Administración', hidden: true })).toBeInTheDocument()
  })

  it('stays expanded on desktop and collapses to the rail with the persisted toggle', () => {
    render(<SidebarModerna />)
    const raiz = navegacion().parentElement as HTMLElement
    expect(raiz).toHaveClass('w-64')

    fireEvent.click(screen.getByRole('button', { name: 'Contraer menú', hidden: true }))

    expect(raiz).toHaveClass('w-16')
    expect(window.localStorage.getItem('sidebar-collapsed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Expandir menú', hidden: true }))
    expect(window.localStorage.getItem('sidebar-collapsed')).toBe('false')
  })

  it('restores the collapsed rail on desktop from localStorage', () => {
    window.localStorage.setItem('sidebar-collapsed', 'true')
    render(<SidebarModerna />)

    expect(screen.getByRole('button', { name: 'Expandir menú', hidden: true })).toHaveAttribute('aria-expanded', 'false')
    expect(navegacion().parentElement).toHaveClass('w-16')
  })

  it('opens a group in a flyout, moves focus into it, and Escape closes it and returns focus', () => {
    simularAncho(900)
    currentPathname = '/grupos-vida/mapa'
    render(<SidebarModerna />)

    const boton = screen.getByRole('button', { name: 'Grupos de Vida, contiene la página actual', hidden: true })
    fireEvent.click(boton)

    expect(boton).toHaveAttribute('aria-expanded', 'true')
    const panel = screen.getByRole('dialog', { name: 'Submenú de Grupos de Vida', hidden: true })
    expect(boton).toHaveAttribute('aria-controls', panel.id)
    expect(within(panel).getByRole('heading', { name: 'Grupos de Vida', hidden: true })).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Grupos de Vida', hidden: true })).toHaveFocus()
    expect(within(panel).getByRole('link', { name: 'Mapa', hidden: true })).toHaveAttribute('aria-current', 'page')

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Submenú de Grupos de Vida', hidden: true })).not.toBeInTheDocument()
    expect(boton).toHaveAttribute('aria-expanded', 'false')
    expect(boton).toHaveFocus()
  })

  it('opens the campus selector in a flyout', () => {
    simularAncho(900)
    campusDisponibles = [{ id: 'c1', nombre: 'Barquisimeto' }, { id: 'c2', nombre: 'Cabudare' }]
    render(<SidebarModerna />)

    fireEvent.click(screen.getByRole('button', { name: 'Campus: Barquisimeto', hidden: true }))

    const panel = screen.getByRole('dialog', { name: 'Campus', hidden: true })
    expect(within(panel).getByRole('combobox', { name: 'Seleccionar campus', hidden: true })).toHaveFocus()
  })

  it('shows the entry name in a tooltip on keyboard focus', () => {
    simularAncho(900)
    render(<SidebarModerna />)

    const usuarios = screen.getByRole('link', { name: 'Usuarios', hidden: true })
    fireEvent.focus(usuarios)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Usuarios')
    fireEvent.blur(usuarios)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})

describe('phone width and session refresh', () => {
  it('is hidden and inert below md', () => {
    simularAncho(390)
    render(<SidebarModerna />)
    const raiz = navegacion().parentElement as HTMLElement

    expect(raiz).toHaveAttribute('inert')
    expect(raiz).toHaveAttribute('aria-hidden', 'true')
    expect(raiz).toHaveClass('hidden', 'md:flex')
  })

  it('refreshes the server tree and the session when the tab becomes visible again', () => {
    const escuchar = jest.fn()
    window.addEventListener('talleres:refresh-session', escuchar)
    render(<SidebarModerna />)

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(escuchar).toHaveBeenCalledTimes(1)
    window.removeEventListener('talleres:refresh-session', escuchar)
  })
})

describe('shell skip link', () => {
  it('skips to the main landmark', () => {
    render(<DashboardLayout><p>Contenido</p></DashboardLayout>)

    const saltar = screen.getByRole('link', { name: 'Saltar al contenido' })
    const principal = screen.getByRole('main')
    expect(saltar).toHaveAttribute('href', `#${principal.id}`)
    expect(principal).toHaveAttribute('tabindex', '-1')
    expect(principal).toHaveTextContent('Contenido')
    // It is the first stop of the keyboard in the shell.
    expect(document.body.querySelector('a, button')).toBe(saltar)
  })
})
