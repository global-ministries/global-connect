/**
 * Grupos de Vida directors (system roles `director-general` / `director-etapa`)
 * can open ONLY "Mi equipo" in Dream Team, read-only — without any Dream Team
 * capability. Everything else keeps today's gates: Servidores, Estructura and
 * every Dream Team API still require a capability, so a director without one
 * gets notFound() / 403 there.
 *
 * The data scope is not decided here: it comes from the database
 * (dream_team_lideres_gdv / dream_team_estructura_gdv); this file pins the UI
 * gate only.
 */

import {
  hasDreamTeamMiEquipoAccess,
  hasDreamTeamOrgManageCapability,
  hasDreamTeamReadCapability,
  hasDreamTeamWriteCapability,
  isGdvDirectorSession,
} from '@/lib/platform/dream-team/capabilities'
import { getDreamTeamNavItems } from '@/lib/platform/dream-team/navigation'
import type { PlatformSession, PlatformSessionCapability } from '@/lib/platform/session/types'

function makeSession(globalRoles: string[], capabilities: PlatformSessionCapability[] = []): PlatformSession {
  return { personaId: 'persona-1', subjectAuthId: 'auth-1', globalRoles, contexts: [], capabilities }
}

const orgManageCap: PlatformSessionCapability = {
  key: 'dream_team.org.manage',
  experience: 'dream_team',
  scopeType: 'experience',
  source: 'manual',
}
const directCap: PlatformSessionCapability = {
  key: 'dream_team.direct',
  experience: 'dream_team',
  scopeType: 'equipo',
  scopeId: 'equipo-dps-camara',
  source: 'dream-team',
}

const MI_EQUIPO = '/dream-team/mi-equipo'
const TRES_PANTALLAS = [MI_EQUIPO, '/admin/dream-team/servidores', '/admin/dream-team/estructura']

describe('isGdvDirectorSession', () => {
  it.each([['director-general'], ['director-etapa']])('is true for the system role %s', (rol) => {
    expect(isGdvDirectorSession(makeSession([rol]))).toBe(true)
  })

  it('is true when a director role sits among other roles', () => {
    expect(isGdvDirectorSession(makeSession(['lider', 'director-etapa']))).toBe(true)
  })

  it.each([[[]], [['lider']], [['admin']], [['pastor']], [['miembro']]])('is false for %j', (roles) => {
    expect(isGdvDirectorSession(makeSession(roles))).toBe(false)
  })
})

describe('hasDreamTeamMiEquipoAccess', () => {
  it('opens for a director without any Dream Team capability', () => {
    expect(hasDreamTeamMiEquipoAccess(makeSession(['director-etapa']))).toBe(true)
    expect(hasDreamTeamMiEquipoAccess(makeSession(['director-general']))).toBe(true)
  })

  it('opens for whoever already passes the capability read gate, with or without a role', () => {
    expect(hasDreamTeamMiEquipoAccess(makeSession([], [orgManageCap]))).toBe(true)
    expect(hasDreamTeamMiEquipoAccess(makeSession(['lider'], [directCap]))).toBe(true)
  })

  it('stays closed for a plain leader, an admin without capability and a member', () => {
    expect(hasDreamTeamMiEquipoAccess(makeSession(['lider']))).toBe(false)
    expect(hasDreamTeamMiEquipoAccess(makeSession(['admin']))).toBe(false)
    expect(hasDreamTeamMiEquipoAccess(makeSession([]))).toBe(false)
  })
})

describe('the capability gates are untouched by a director role', () => {
  const director = makeSession(['director-general', 'director-etapa'])

  it('a director without capability does not pass the read gate (Servidores / Estructura / APIs)', () => {
    expect(hasDreamTeamReadCapability(director)).toBe(false)
  })

  it('a director without capability does not pass the write gate (no edit buttons, no mutating API)', () => {
    expect(hasDreamTeamWriteCapability(director)).toBe(false)
    expect(hasDreamTeamOrgManageCapability(director)).toBe(false)
  })

  it('a capability holder passes the read and write gates exactly as before', () => {
    const holder = makeSession([], [orgManageCap])
    expect(hasDreamTeamReadCapability(holder)).toBe(true)
    expect(hasDreamTeamWriteCapability(holder)).toBe(true)
  })
})

describe('getDreamTeamNavItems for directors', () => {
  it('a director without capability sees only Mi equipo', () => {
    for (const rol of ['director-general', 'director-etapa']) {
      expect(getDreamTeamNavItems(makeSession([rol]), true).map((item) => item.href)).toEqual([MI_EQUIPO])
    }
  })

  it('a session with both director roles still sees only Mi equipo', () => {
    expect(getDreamTeamNavItems(makeSession(['director-general', 'director-etapa']), true).map((i) => i.href)).toEqual([
      MI_EQUIPO,
    ])
  })

  it('keeps Mi equipo\'s id and label from the shared list', () => {
    expect(getDreamTeamNavItems(makeSession(['director-etapa']), true)).toEqual([
      { id: 'dt-mi-equipo', label: 'Mi equipo', href: MI_EQUIPO },
    ])
  })

  it('a capability holder sees the three screens, even with a director role', () => {
    expect(getDreamTeamNavItems(makeSession([], [orgManageCap]), true).map((i) => i.href)).toEqual(TRES_PANTALLAS)
    expect(getDreamTeamNavItems(makeSession(['director-etapa'], [directCap]), true).map((i) => i.href)).toEqual(
      TRES_PANTALLAS,
    )
  })

  it('shows nothing to a plain leader or member', () => {
    expect(getDreamTeamNavItems(makeSession(['lider']), true)).toEqual([])
    expect(getDreamTeamNavItems(makeSession([]), true)).toEqual([])
  })

  it('shows nothing to anyone when the flag is off, directors included', () => {
    expect(getDreamTeamNavItems(makeSession(['director-etapa']), false)).toEqual([])
    expect(getDreamTeamNavItems(makeSession([], [orgManageCap]), false)).toEqual([])
  })

  it('shows nothing without a session', () => {
    expect(getDreamTeamNavItems(null, true)).toEqual([])
    expect(getDreamTeamNavItems(undefined, true)).toEqual([])
  })
})
