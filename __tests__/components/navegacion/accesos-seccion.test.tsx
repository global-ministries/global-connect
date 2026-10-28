import { render, screen, within } from '@testing-library/react'

import { AccesosSeccion } from '@/components/navegacion/accesos-seccion'
import { DreamTeamAccesoProvider } from '@/hooks/useDreamTeamAcceso'
import type { PlatformSession } from '@/lib/platform/session/types'

/**
 * The Equipo tab's root page (/dream-team) lists the Dream Team pages the user
 * can open (odd/tasks/sistema-diseno-v2.md L21, S9.8): on phone the "Más"
 * sheet has no submenus, so this list is the only way to Servidores and
 * Estructura. Who sees which page comes from the navigation registry.
 */

let currentPlatformSession: PlatformSession | null = null

jest.mock('next/navigation', () => ({ usePathname: () => '/dream-team' }))
jest.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    usuario: null,
    roles: ['miembro'],
    supportCapabilities: [],
    platformSession: currentPlatformSession,
    loading: false,
    error: null,
  }),
}))

const base: PlatformSession = { personaId: 'persona-1', subjectAuthId: 'auth-1', globalRoles: [], contexts: [], capabilities: [] }
const lector: PlatformSession = {
  ...base,
  capabilities: [{ key: 'dream_team.org.manage', experience: 'dream_team', scopeType: 'experience', source: 'manual' }],
}
const coordinador: PlatformSession = {
  ...base,
  capabilities: [{ key: 'dream_team.coordinate', experience: 'dream_team', scopeType: 'equipo', scopeId: 'musica', source: 'dream-team' }],
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
  currentPlatformSession = null
})

afterAll(() => {
  delete process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED
})

function accesos() {
  return within(screen.getByRole('list', { name: 'Accesos' }))
}

describe('AccesosSeccion for Dream Team', () => {
  it('lists Mi equipo, Servidores and Estructura for a reader, each with a description', () => {
    currentPlatformSession = lector
    render(<AccesosSeccion seccion="dream-team" />)

    const enlaces = accesos().getAllByRole('link')
    expect(enlaces.map((enlace) => enlace.getAttribute('href'))).toEqual([
      '/dream-team/mi-equipo', '/admin/dream-team/servidores', '/admin/dream-team/estructura',
    ])
    const servidores = accesos().getByRole('link', { name: /Servidores/ })
    expect(servidores.querySelector('[data-slot="descripcion"]')?.textContent).toBeTruthy()
    expect(servidores).toHaveClass('min-h-16')
  })

  it('lists only Mi equipo for an area coordinator', () => {
    currentPlatformSession = coordinador
    render(<AccesosSeccion seccion="dream-team" />)

    expect(accesos().getAllByRole('link').map((enlace) => enlace.getAttribute('href'))).toEqual(['/dream-team/mi-equipo'])
  })

  it('lists only Mi equipo for whoever may register people', () => {
    currentPlatformSession = base
    render(
      <DreamTeamAccesoProvider puedeRegistrar>
        <AccesosSeccion seccion="dream-team" />
      </DreamTeamAccesoProvider>,
    )

    expect(accesos().getAllByRole('link').map((enlace) => enlace.getAttribute('href'))).toEqual(['/dream-team/mi-equipo'])
  })

  it('shows the empty state when the user can open no Dream Team page', () => {
    currentPlatformSession = base
    render(<AccesosSeccion seccion="dream-team" />)

    expect(screen.queryByRole('list', { name: 'Accesos' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('No tenés accesos en esta sección')).toBeInTheDocument()
  })

  it('shows the empty state when the flag is off, even for a reader', () => {
    delete process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED
    currentPlatformSession = lector
    render(<AccesosSeccion seccion="dream-team" />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('No tenés accesos en esta sección')).toBeInTheDocument()
  })
})
