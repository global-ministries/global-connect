import { render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'

import { HeaderMovil } from '@/components/ui/header-movil'
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
 * rest moves to the "Más" sheet (see BARRA_INFERIOR_DESPUES).
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

/** Sidebar and drawer list the same entries (the drawer is the sidebar's twin). */
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

/** Only the desktop sidebar opens Talleres as a submenu (TalleresNavSubmenu). */
const SIDEBAR: Record<string, string[]> = {
  ...MENU_PRINCIPAL,
  'plataforma-grupos-pastoral': [
    '/dashboard', '/users', '/grupos-vida', '/grupos-vida',
    '/talleres/explorar', '/talleres', '/talleres/explorar', '/talleres/mi-recorrido', ...PIE,
  ],
}

const BARRA_INFERIOR_ANTES: Record<string, string[]> = {
  ...Object.fromEntries(Object.keys(PERFILES).map((perfil) => [perfil, ['/dashboard', '/users', '/grupos-vida', '/ayuda']])),
  'plataforma-grupos-pastoral': ['/grupos-vida', '/talleres/explorar'],
}

/**
 * The one intended change, the tab bar (S9.7): Usuarios moves to "Más"; Niños
 * and Equipo (Dream Team) take their slots when allowed; platform mode keeps
 * Inicio, Grupos and Ayuda next to Talleres instead of replacing them.
 */
const BARRA_INFERIOR_DESPUES: Record<string, string[]> = {
  ...Object.fromEntries(Object.keys(PERFILES).map((perfil) => [perfil, ['/dashboard', '/grupos-vida', '/ayuda']])),
  'admin-dream-team-ninos': ['/dashboard', '/grupos-vida', '/ninos/checkin', '/dream-team/mi-equipo'],
  'plataforma-grupos-pastoral': ['/dashboard', '/grupos-vida', '/talleres/explorar', '/ayuda'],
}

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

  it.each(Object.keys(PERFILES))('mobile drawer keeps the same entries for %s', async (perfil) => {
    usarPerfil(perfil)
    render(conProveedores(<HeaderMovil />, PERFILES[perfil]))
    const drawer = screen.getByLabelText('Menú de navegación')
    await waitFor(() => expect(hrefsDe(drawer)).toEqual(MENU_PRINCIPAL[perfil]))
  })

  it.each(Object.keys(PERFILES))('bottom bar shows the expected entries for %s', async (perfil) => {
    usarPerfil(perfil)
    render(conProveedores(<MenuInferiorMovil />, PERFILES[perfil]))
    const barra = screen.getByRole('navigation', { name: 'Navegación inferior' })

    await waitFor(() => expect(hrefsDe(barra)).toEqual(BARRA_INFERIOR_DESPUES[perfil]))
  })

  it.each(Object.keys(PERFILES))('bottom bar only offers pages the sidebar shows %s', (perfil) => {
    expect(BARRA_INFERIOR_DESPUES[perfil].filter((href) => !SIDEBAR[perfil].includes(href))).toEqual([])
  })

  it('documents the bottom bar as the only intended difference', () => {
    // Every profile drops /users (now in "Más"); none gains a page it could not open before.
    for (const perfil of Object.keys(PERFILES)) {
      const ganadas = BARRA_INFERIOR_DESPUES[perfil].filter((href) => !BARRA_INFERIOR_ANTES[perfil].includes(href))
      expect(ganadas.every((href) => MENU_PRINCIPAL[perfil].includes(href))).toBe(true)
      expect(BARRA_INFERIOR_DESPUES[perfil]).not.toContain('/users')
      expect(BARRA_INFERIOR_DESPUES[perfil].length).toBeLessThanOrEqual(4)
    }
  })
})
