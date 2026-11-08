/**
 * The Dream Team menu section with the DPS facts of the (auth) layout
 * (odd/tasks/dps-asistencia-pco.md, T9): the provider hands `dps` to
 * useDreamTeamMenuItem, which adds "Asistencia DPS" / "Configuración DPS"
 * with their icon and description; without them the section is unchanged.
 */
import type { ReactNode } from 'react'
import { renderHook } from '@testing-library/react'

import { useDreamTeamMenuItem } from '@/components/ui/dream-team-menu-item'
import { DreamTeamAccesoProvider } from '@/hooks/useDreamTeamAcceso'
import type { DpsAcceso } from '@/lib/platform/dream-team/dps/acceso'
import type { PlatformSession } from '@/lib/platform/session/types'

const coordinador = {
  personaId: 'p-1',
  subjectAuthId: 'a-1',
  globalRoles: [],
  contexts: [],
  capabilities: [{ key: 'dream_team.coordinate', experience: 'dream_team', scopeType: 'equipo', scopeId: 'audio', source: 'test' }],
} as unknown as PlatformSession

const con = (dps?: DpsAcceso) =>
  function Envoltorio({ children }: { children: ReactNode }) {
    return (
      <DreamTeamAccesoProvider puedeRegistrar={false} dps={dps}>
        {children}
      </DreamTeamAccesoProvider>
    )
  }

beforeEach(() => {
  process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'on'
})

describe('useDreamTeamMenuItem with DPS', () => {
  it('adds the attendance for a DPS coordinator, with icon and description', () => {
    const { result } = renderHook(() => useDreamTeamMenuItem(coordinador), { wrapper: con({ ver: true, planificar: false }) })
    const hijos = result.current?.children ?? []
    expect(hijos.map((c) => c.href)).toEqual(['/dream-team/mi-equipo', '/dream-team/pendientes', '/dream-team/dps/asistencia'])
    expect(hijos[2]).toMatchObject({ label: 'Asistencia DPS', descripcion: 'Quién llegó a servir en el plan de hoy' })
    expect(hijos[2].icon).toBeDefined()
  })

  it('adds both for a planner without other Dream Team access', () => {
    const sinPermisos = { ...coordinador, capabilities: [] } as PlatformSession
    const { result } = renderHook(() => useDreamTeamMenuItem(sinPermisos), { wrapper: con({ ver: true, planificar: true }) })
    expect(result.current?.children.map((c) => c.label)).toEqual(['Asistencia DPS', 'Configuración DPS'])
    expect(result.current?.href).toBe('/dream-team/dps/asistencia')
  })

  it('is unchanged without the DPS facts', () => {
    for (const wrapper of [con(), con({ ver: false, planificar: false })]) {
      const { result } = renderHook(() => useDreamTeamMenuItem(coordinador), { wrapper })
      expect(result.current?.children.map((c) => c.href)).toEqual(['/dream-team/mi-equipo', '/dream-team/pendientes'])
    }
  })
})
