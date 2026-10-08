import type { ReactNode } from 'react'
import { renderHook } from '@testing-library/react'

import { useDreamTeamMenuItem } from '@/components/ui/dream-team-menu-item'
import { DreamTeamAccesoProvider } from '@/hooks/useDreamTeamAcceso'
import type { PlatformSession } from '@/lib/platform/session/types'

const SESION = {
  personaId: 'p-1',
  subjectAuthId: 'a-1',
  globalRoles: [],
  contexts: [],
  capabilities: [{ key: 'dream_team.coordinate', experience: 'dream_team', scopeType: 'equipo', scopeId: 'av', source: 'test' }],
} as unknown as PlatformSession

const conAcceso = (puedeRegistrar: boolean) =>
  function Envoltorio({ children }: { children: ReactNode }) {
    return <DreamTeamAccesoProvider puedeRegistrar={puedeRegistrar}>{children}</DreamTeamAccesoProvider>
  }

beforeEach(() => {
  process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'on'
})

describe('useDreamTeamMenuItem — the volunteer coordinator', () => {
  it('shows Mi equipo when the layout says they may register people', () => {
    const { result } = renderHook(() => useDreamTeamMenuItem(SESION), { wrapper: conAcceso(true) })
    expect(result.current?.children.map((c) => c.href)).toEqual(['/dream-team/mi-equipo'])
  })
  it('shows nothing for another coordinator (flag false) or outside the provider', () => {
    expect(renderHook(() => useDreamTeamMenuItem(SESION), { wrapper: conAcceso(false) }).result.current).toBeNull()
    expect(renderHook(() => useDreamTeamMenuItem(SESION)).result.current).toBeNull()
  })
})
