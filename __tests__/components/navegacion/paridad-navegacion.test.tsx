import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'

import { AccesosSeccion } from '@/components/navegacion/accesos-seccion'
import { MenuCuenta } from '@/components/navegacion/menu-cuenta'
import { MenuInferiorMovil } from '@/components/ui/menu-inferior-movil'
import { SidebarModerna } from '@/components/ui/sidebar-moderna'
import { NinosAccesoProvider } from '@/hooks/useNinosAcceso'
import { UnoAUnoAccesoProvider } from '@/hooks/useUnoAUnoAcceso'
import type { AccesoUnoAUno } from '@/lib/uno-a-uno/acceso'
import type { PlatformSession } from '@/lib/platform/session/types'

/**
 * Navigation parity — who sees what, per surface.
 *
 * The expected hrefs below were recorded against the navigation as it was
 * before the single registry (lib/navegacion/registro.ts) existed: three
 * hand-kept lists in sidebar-moderna.tsx, header-movil.tsx and
 * menu-inferior-movil.tsx. The registry must keep every one of them, in the
 * same order, for every representative permission set.
 *
 * The only intended difference is the bottom bar. Its legacy links used to
 * ignore roles, so a member saw "Usuarios" there while the sidebar and the
 * drawer hid it; since the app shell (odd/tasks/sistema-diseno-v2.md, S9.6-7)
 * it holds up to four tabs picked from what the sidebar shows (Inicio, Grupos,
 * Niños, Equipo, then Talleres and Ayuda), in every navigation mode, and the
 * rest moves to the "Más" sheet (see BARRA_INFERIOR_DESPUES). The phone has no
 * drawer any more: tabs, "Más" (with its sub-page blocks, S10) and the
 * /dream-team root page together reach exactly the sidebar's pages.
 */

type Perfil = {
  roles: string[]
  supportCapabilities?: string[]
  platformSession?: PlatformSession | null
  ninos?: boolean
  /** uno_a_uno_acceso() for "Mis 1 a 1", odd/tasks/uno-a-uno.md T4/T7. */
  unoAUno?: AccesoUnoAUno
  dreamTeam?: boolean
  platformNavigation?: boolean
}

let current: Perfil = { roles: ['miembro'] }

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))
jest.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    usuario: { id: 'usuario-1', nombre: 'Ana', apellido: 'Pérez', foto_perfil_url: null, email: 'ana@example.com' },
    roles: current.roles,
    supportCapabilities: current.supportCapabilities ?? [],
    platformSession: current.platformSession ?? null,
    loading: false,
    error: null,
  }),
}))
jest.mock('@/hooks/useBranding', () => ({ useBranding: () => ({ logoLightUrl: null, logoDarkUrl: null }) }))
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => ({ info: jest.fn() }) }))
jest.mock('@/hooks/useCampus', () => ({ useCampus: () => ({ campusActivo: null, localidadActiva: null, campusDisponibles: [], localidadesDisponibles: [], campusId: null, localidadId: null, esSuperadmin: false, loading: false, seleccionarCampus: jest.fn(), seleccionarLocalidad: jest.fn() }) }))
jest.mock('@/lib/actions/auth.actions', () => ({ logout: jest.fn() }))
jest.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light', setTheme: jest.fn() }) }))

const baseSession: PlatformSession = { personaId: 'persona-1', subjectAuthId: 'auth-1', globalRoles: [], contexts: [], capabilities: [] }

const PERFILES: Record<string, Perfil> = {
  miembro: { roles: ['miembro'] },
  lider: { roles: ['lider'] },
  'director-etapa': { roles: ['director-etapa'] },
  'director-general': { roles: ['director-general'] },
  pastor: { roles: ['pastor'] },
  admin: { roles: ['admin'] },
  'staff-soporte': { roles: ['miembro'], supportCapabilities: ['support.view'] },
  'director-general-soporte': { roles: ['director-general'], supportCapabilities: ['support.manage'] },
  'admin-dream-team-ninos': {
    roles: ['admin'],
    dreamTeam: true,
    ninos: true,
    platformSession: { ...baseSession, capabilities: [{ key: 'dream_team.org.manage', experience: 'dream_team', scopeType: 'experience', source: 'manual' }] },
  },
  'lider-uno-a-uno': { roles: ['lider'], unoAUno: { lidera: true, supervisa: false, participa: false } },
  'plataforma-grupos-pastoral': {
    roles: ['lider'],
    platformNavigation: true,
    platformSession: {
      ...baseSession,
      contexts: [{ experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', label: 'Grupos de Vida — Adultos' }],
      capabilities: [
        { key: 'grupos_vida.stage.read', experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', source: 'gdv' },
        { key: 'pastoral.read.all', experience: 'pastoral', scopeType: 'experience', source: 'manual' },
      ],
    },
  },
}

const GRUPOS_VIDA_DIRECCION = [
  '/grupos-vida/casas-anfitrionas', '/grupos-vida/segmentos', '/grupos-vida/directores', '/grupos-vida/temporadas',
  '/grupos-vida/mapa', '/grupos-vida/reportes/asistencia-semanal', '/grupos-vida/dashboard-riesgo', '/grupos-vida/solicitudes',
]
const GRUPOS_VIDA_ETAPA = GRUPOS_VIDA_DIRECCION.filter((href) => href !== '/grupos-vida/directores' && href !== '/grupos-vida/temporadas')
const PIE = ['/actualizaciones', '/ayuda', '/perfil']

/** Sidebar and the old mobile drawer (removed in S9.6) listed the same entries before the app shell. */
const MENU_PRINCIPAL: Record<string, string[]> = {
  miembro: ['/dashboard', '/grupos-vida', ...PIE],
  lider: ['/dashboard', '/users', '/grupos-vida', ...PIE],
  'director-etapa': ['/dashboard', '/users', '/grupos-vida', ...GRUPOS_VIDA_ETAPA, ...PIE],
  'director-general': ['/dashboard', '/users', '/grupos-vida', ...GRUPOS_VIDA_DIRECCION, '/configuracion', ...PIE],
  pastor: ['/dashboard', '/users', '/grupos-vida', ...GRUPOS_VIDA_DIRECCION, '/grupos-vida/configuracion', '/configuracion', '/configuracion', ...PIE],
  admin: ['/dashboard', '/users', '/grupos-vida', ...GRUPOS_VIDA_DIRECCION, '/grupos-vida/configuracion', '/configuracion', '/configuracion', ...PIE],
  'staff-soporte': ['/dashboard', '/grupos-vida', '/ayuda/admin', ...PIE],
  'director-general-soporte': ['/dashboard', '/users', '/grupos-vida', ...GRUPOS_VIDA_DIRECCION, '/configuracion', '/configuracion/soporte', '/ayuda/admin', ...PIE],
  'admin-dream-team-ninos': [
    '/dashboard', '/users', '/grupos-vida', ...GRUPOS_VIDA_DIRECCION, '/grupos-vida/configuracion',
    '/dream-team/mi-equipo', '/dream-team/mi-equipo', '/admin/dream-team/servidores', '/admin/dream-team/estructura',
    '/ninos/checkin', '/ninos/checkin', '/ninos/familias', '/ninos/salon', '/ninos/cartel', '/ninos/reportes',
    '/configuracion', '/configuracion', ...PIE,
  ],
  // Added with "Mis 1 a 1" (uno-a-uno T4): right after Dashboard, server-fed like Niños.
  'lider-uno-a-uno': ['/dashboard', '/mis-uno-a-uno', '/users', '/grupos-vida', ...PIE],
  'plataforma-grupos-pastoral': ['/dashboard', '/users', '/grupos-vida', '/grupos-vida', '/talleres/explorar', ...PIE],
}

/**
 * The sidebar before the app shell. Only the desktop sidebar opens Talleres as
 * a submenu (TalleresNavSubmenu).
 */
const SIDEBAR_ANTES: Record<string, string[]> = {
  ...MENU_PRINCIPAL,
  'plataforma-grupos-pastoral': [
    '/dashboard', '/users', '/grupos-vida', '/grupos-vida',
    '/talleres/explorar', '/talleres', '/talleres/explorar', '/talleres/mi-recorrido', ...PIE,
  ],
}

/**
 * The sidebar since the app shell (odd/tasks/sistema-diseno-v2.md, S9.2 and
 * S9.4): the same pages, ordered by section — general (Inicio, Mis 1 a 1) ·
 * Ministerios (Grupos de Vida, Niños, Talleres…) · Dream Team · Administración
 * (Usuarios, Configuración, Cola de soporte) · footer (Actualizaciones, Ayuda).
 * Mi perfil moved to the account menu of the header.
 */
const PIE_SIDEBAR = ['/actualizaciones', '/ayuda']
const NINOS = ['/ninos/checkin', '/ninos/checkin', '/ninos/familias', '/ninos/salon', '/ninos/cartel', '/ninos/reportes']
const DREAM_TEAM = ['/dream-team/mi-equipo', '/dream-team/mi-equipo', '/admin/dream-team/servidores', '/admin/dream-team/estructura']
const SIDEBAR: Record<string, string[]> = {
  miembro: ['/dashboard', '/grupos-vida', ...PIE_SIDEBAR],
  lider: ['/dashboard', '/grupos-vida', '/users', ...PIE_SIDEBAR],
  'director-etapa': ['/dashboard', '/grupos-vida', ...GRUPOS_VIDA_ETAPA, '/users', ...PIE_SIDEBAR],
  'director-general': ['/dashboard', '/grupos-vida', ...GRUPOS_VIDA_DIRECCION, '/users', '/configuracion', ...PIE_SIDEBAR],
  pastor: [
    '/dashboard', '/grupos-vida', ...GRUPOS_VIDA_DIRECCION, '/grupos-vida/configuracion',
    '/users', '/configuracion', '/configuracion', ...PIE_SIDEBAR,
  ],
  admin: [
    '/dashboard', '/grupos-vida', ...GRUPOS_VIDA_DIRECCION, '/grupos-vida/configuracion',
    '/users', '/configuracion', '/configuracion', ...PIE_SIDEBAR,
  ],
  'staff-soporte': ['/dashboard', '/grupos-vida', '/ayuda/admin', ...PIE_SIDEBAR],
  'director-general-soporte': [
    '/dashboard', '/grupos-vida', ...GRUPOS_VIDA_DIRECCION,
    '/users', '/configuracion', '/configuracion/soporte', '/ayuda/admin', ...PIE_SIDEBAR,
  ],
  'admin-dream-team-ninos': [
    '/dashboard', '/grupos-vida', ...GRUPOS_VIDA_DIRECCION, '/grupos-vida/configuracion', ...NINOS,
    ...DREAM_TEAM,
    '/users', '/configuracion', '/configuracion', ...PIE_SIDEBAR,
  ],
  'lider-uno-a-uno': ['/dashboard', '/mis-uno-a-uno', '/grupos-vida', '/users', ...PIE_SIDEBAR],
  'plataforma-grupos-pastoral': [
    '/dashboard', '/grupos-vida', '/grupos-vida',
    '/talleres/explorar', '/talleres', '/talleres/explorar', '/talleres/mi-recorrido',
    '/users', ...PIE_SIDEBAR,
  ],
}

/** Where Mi perfil lives since the app shell (S9.4). */
const MENU_CUENTA = ['/perfil']

const BARRA_INFERIOR_ANTES: Record<string, string[]> = {
  ...Object.fromEntries(Object.keys(PERFILES).map((perfil) => [perfil, ['/dashboard', '/users', '/grupos-vida', '/ayuda']])),
  'plataforma-grupos-pastoral': ['/grupos-vida', '/talleres/explorar'],
}

/**
 * The Equipo tab's root page (app/(auth)/dream-team/page.tsx). Not a sidebar
 * link: it lists the Dream Team pages the sidebar shows the user (L21).
 */
const RAIZ_DREAM_TEAM = '/dream-team'

/**
 * The one intended change, the tab bar (S9.7): Usuarios moves to "Más"; Niños
 * and Equipo (Dream Team, opening its root page) take their slots when allowed;
 * platform mode keeps Inicio, Grupos and Ayuda next to Talleres instead of
 * replacing them.
 */
const BARRA_INFERIOR_DESPUES: Record<string, string[]> = {
  ...Object.fromEntries(Object.keys(PERFILES).map((perfil) => [perfil, ['/dashboard', '/grupos-vida', '/ayuda']])),
  'admin-dream-team-ninos': ['/dashboard', '/grupos-vida', '/ninos/checkin', RAIZ_DREAM_TEAM],
  'plataforma-grupos-pastoral': ['/dashboard', '/grupos-vida', '/talleres/explorar', '/ayuda'],
}

/**
 * Pages a phone reaches from a tab's root page rather than from "Más" (S10):
 * when Niños or Talleres is a tab, its root page leads to the rest of the
 * group, so "Más" has no block for it.
 */
const DESDE_RAIZ_PESTANA: Record<string, string[]> = {
  'admin-dream-team-ninos': ['/ninos/familias', '/ninos/salon', '/ninos/cartel', '/ninos/reportes'],
  'plataforma-grupos-pastoral': ['/talleres', '/talleres/mi-recorrido'],
}

const unicos = (hrefs: readonly string[]) => [...new Set(hrefs)].sort()

function conProveedores(ui: ReactElement, perfil: Perfil): ReactElement {
  const conUnoAUno = perfil.unoAUno ? <UnoAUnoAccesoProvider acceso={perfil.unoAUno}>{ui}</UnoAUnoAccesoProvider> : ui
  return perfil.ninos ? <NinosAccesoProvider puedeOperar puedeVerSalon puedeConfigurar>{conUnoAUno}</NinosAccesoProvider> : conUnoAUno
}

function hrefsDe(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('a[href]')).map((link) => link.getAttribute('href') ?? '')
}

const envOriginal = { ...process.env }

function usarPerfil(nombre: string) {
  current = PERFILES[nombre]
  process.env = { ...envOriginal }
  if (current.dreamTeam) process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
  if (current.platformNavigation) process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = 'true'
}

afterAll(() => {
  process.env = envOriginal
})

describe('navigation parity per permission set', () => {
  it.each(Object.keys(PERFILES))('desktop sidebar keeps the same entries for %s', async (perfil) => {
    usarPerfil(perfil)
    render(conProveedores(<SidebarModerna />, PERFILES[perfil]))
    const nav = screen.getByRole('navigation', { name: 'Navegación principal', hidden: true }).parentElement as HTMLElement

    await waitFor(() => expect(hrefsDe(nav)).toEqual(SIDEBAR[perfil]))
  })

  it.each(Object.keys(PERFILES))('desktop sidebar plus account menu keep the same set of pages for %s', (perfil) => {
    // Only the order changed (by section) and Mi perfil moved to the account menu.
    const despues = [...SIDEBAR[perfil], ...MENU_CUENTA].sort()
    expect(despues).toEqual([...SIDEBAR_ANTES[perfil]].sort())
  })

  it.each(Object.keys(PERFILES))('account menu links Mi perfil for %s', async (perfil) => {
    usarPerfil(perfil)
    render(conProveedores(<MenuCuenta />, PERFILES[perfil]))
    fireEvent.click(screen.getByRole('button', { name: 'Tu cuenta: Ana Pérez' }))
    const menu = screen.getByRole('dialog', { name: 'Ana Pérez' })

    await waitFor(() => expect(hrefsDe(menu)).toEqual(MENU_CUENTA))
  })

  it.each(Object.keys(PERFILES))('phone keeps the same pages for %s', async (perfil) => {
    // Tabs + "Más" (sections, S10 blocks, Mi perfil) + the /dream-team list
    // (+ what the Niños and Talleres tab roots lead to) == sidebar + account menu.
    usarPerfil(perfil)
    render(conProveedores(<MenuInferiorMovil />, PERFILES[perfil]))
    const barra = screen.getByRole('navigation', { name: 'Navegación inferior' })
    await waitFor(() => expect(hrefsDe(barra)).toEqual(BARRA_INFERIOR_DESPUES[perfil]))
    const pestanas = hrefsDe(barra)

    fireEvent.click(screen.getByRole('button', { name: 'Más' }))
    const mas = hrefsDe(screen.getByRole('dialog', { name: 'Más' }))

    let dreamTeam: string[] = []
    if (pestanas.includes(RAIZ_DREAM_TEAM)) {
      const { container } = render(conProveedores(<AccesosSeccion seccion="dream-team" />, PERFILES[perfil]))
      dreamTeam = hrefsDe(container)
      expect(dreamTeam.length).toBeGreaterThan(0)
    }

    const telefono = [...pestanas, ...mas, ...dreamTeam, ...(DESDE_RAIZ_PESTANA[perfil] ?? [])]
      .filter((href) => href !== RAIZ_DREAM_TEAM)
    expect(unicos(telefono)).toEqual(unicos([...SIDEBAR[perfil], ...MENU_CUENTA]))
    // Nothing reached only from a tab root is a page "Más" already lists.
    expect(mas.filter((href) => (DESDE_RAIZ_PESTANA[perfil] ?? []).includes(href))).toEqual([])
  })

  it.each(Object.keys(PERFILES))('bottom bar shows the expected entries for %s', async (perfil) => {
    usarPerfil(perfil)
    render(conProveedores(<MenuInferiorMovil />, PERFILES[perfil]))
    const barra = screen.getByRole('navigation', { name: 'Navegación inferior' })

    await waitFor(() => expect(hrefsDe(barra)).toEqual(BARRA_INFERIOR_DESPUES[perfil]))
  })

  it.each(Object.keys(PERFILES))('bottom bar only offers pages the sidebar shows %s', (perfil) => {
    // The Equipo tab opens the /dream-team root, which lists sidebar pages only.
    expect(BARRA_INFERIOR_DESPUES[perfil].filter((href) => href !== RAIZ_DREAM_TEAM && !SIDEBAR[perfil].includes(href))).toEqual([])
  })

  it('documents the bottom bar as the only intended difference', () => {
    // Every profile drops /users (now in "Más"); none gains a page it could not open before.
    for (const perfil of Object.keys(PERFILES)) {
      const ganadas = BARRA_INFERIOR_DESPUES[perfil].filter((href) => !BARRA_INFERIOR_ANTES[perfil].includes(href))
      expect(ganadas.every((href) => href === RAIZ_DREAM_TEAM || MENU_PRINCIPAL[perfil].includes(href))).toBe(true)
      expect(BARRA_INFERIOR_DESPUES[perfil]).not.toContain('/users')
      expect(BARRA_INFERIOR_DESPUES[perfil].length).toBeLessThanOrEqual(4)
    }
  })
})
