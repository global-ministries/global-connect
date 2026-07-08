import {
  resolveDreamTeamGdvPlatformContext,
  type DreamTeamGdvAdapterInput,
} from '@/lib/platform/adapters/dream-team-gdv'
import type {
  DreamTeamGdvMember,
  DreamTeamGdvMembershipReader,
} from '@/lib/platform/dream-team/repository'
import { personaId } from '@/lib/platform/dream-team/types'
import type { PlatformSession } from '@/lib/platform/session/types'

const ANA_PERSONA_ID = personaId('ana-001')
const TRANSIT_GROUP_ID = 'transit-001'
const ADULTOS_GROUP_ID = 'adultos-001'

function makeSession(overrides?: Partial<PlatformSession>): PlatformSession {
  return {
    personaId: 'ana-001',
    subjectAuthId: 'auth-ana-001',
    globalRoles: [],
    contexts: [],
    capabilities: [],
    ...overrides,
  }
}

function makeMember(overrides?: Partial<DreamTeamGdvMember>): DreamTeamGdvMember {
  return {
    personaId: ANA_PERSONA_ID,
    grupoId: TRANSIT_GROUP_ID,
    tipoLider: 'lider_grupo',
    activo: true,
    fechaInicio: '2026-01-01',
    ...overrides,
  }
}

function makeReader(members: readonly DreamTeamGdvMember[]): DreamTeamGdvMembershipReader {
  return {
    listActiveLideres: jest.fn().mockResolvedValue(members),
    getMember: jest.fn(),
    diffMembership: jest.fn(),
  }
}

function makeInput(input?: Partial<DreamTeamGdvAdapterInput>): DreamTeamGdvAdapterInput {
  return {
    session: makeSession(),
    reader: makeReader([]),
    ...input,
  }
}

describe('resolveDreamTeamGdvPlatformContext', () => {
  describe('session validation', () => {
    it('denies when session is missing', async () => {
      const result = await resolveDreamTeamGdvPlatformContext(makeInput({ session: undefined }))

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('session_required')
      expect(result.audit.decision).toBe('denied')
      expect(result.audit.readerCalls).toBe(0)
    })

    it('denies when session has no authenticated subject', async () => {
      const result = await resolveDreamTeamGdvPlatformContext(
        makeInput({ session: makeSession({ subjectAuthId: '   ' }) }),
      )

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('session_required')
    })

    it('denies when personaId is empty', async () => {
      const result = await resolveDreamTeamGdvPlatformContext(
        makeInput({ session: makeSession({ personaId: '' }) }),
      )

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('session_required')
    })
  })

  describe('reader failures', () => {
    it('denies when the reader throws', async () => {
      const reader: DreamTeamGdvMembershipReader = {
        listActiveLideres: jest.fn().mockRejectedValue(new Error('DB unavailable')),
        getMember: jest.fn(),
        diffMembership: jest.fn(),
      }

      const result = await resolveDreamTeamGdvPlatformContext(makeInput({ reader }))

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('adapter_read_failed')
      expect(result.audit.readerCalls).toBe(1)
    })
  })

  describe('empty memberships', () => {
    it('returns allowed with empty contexts and capabilities', async () => {
      const reader = makeReader([])
      const result = await resolveDreamTeamGdvPlatformContext(makeInput({ reader }))

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.contexts).toEqual([])
      expect(result.capabilities).toEqual([])
      expect(result.leadershipChanges).toEqual([])
      expect(result.audit).toEqual({
        decision: 'allowed',
        readerCalls: 1,
        membershipCount: 0,
        grantCount: 0,
      })
    })
  })

  describe('active leadership produces capabilities', () => {
    it('produces dream_team.gdv.lead for an active lider_grupo', async () => {
      const reader = makeReader([makeMember()])
      const result = await resolveDreamTeamGdvPlatformContext(makeInput({ reader }))

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.contexts).toHaveLength(1)
      expect(result.contexts[0]).toEqual({
        personaId: ANA_PERSONA_ID,
        grupoId: TRANSIT_GROUP_ID,
        tipoLider: 'lider_grupo',
      })
      expect(result.capabilities).toHaveLength(1)
      expect(result.capabilities[0]).toMatchObject({
        key: 'dream_team.gdv.lead',
        scope: { experience: 'grupos_vida', type: 'grupo', id: TRANSIT_GROUP_ID },
        source: 'gdv:lider',
      })
      expect(result.audit.grantCount).toBe(1)
      expect(result.audit.membershipCount).toBe(1)
    })

    it('produces dream_team.gdv.lead for an active director_de_etapa', async () => {
      const reader = makeReader([
        makeMember({ tipoLider: 'director_etapa', grupoId: ADULTOS_GROUP_ID }),
      ])
      const result = await resolveDreamTeamGdvPlatformContext(makeInput({ reader }))

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.capabilities).toHaveLength(1)
      expect(result.capabilities[0]).toMatchObject({
        key: 'dream_team.gdv.lead',
        scope: { experience: 'grupos_vida', type: 'grupo', id: ADULTOS_GROUP_ID },
      })
    })

    it('produces dream_team.gdv.lead for an active coordinador_grupo', async () => {
      const reader = makeReader([makeMember({ tipoLider: 'coordinador_grupo' })])
      const result = await resolveDreamTeamGdvPlatformContext(makeInput({ reader }))

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.capabilities).toHaveLength(1)
      expect(result.contexts[0].tipoLider).toBe('coordinador_grupo')
    })

    it('does not produce a capability for a regular miembro', async () => {
      const reader = makeReader([makeMember({ tipoLider: 'miembro' })])
      const result = await resolveDreamTeamGdvPlatformContext(makeInput({ reader }))

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.capabilities).toEqual([])
      expect(result.contexts).toEqual([])
      expect(result.audit.grantCount).toBe(0)
    })

    it('produces one capability per leader even when sharing the same group', async () => {
      const reader = makeReader([
        makeMember({ personaId: personaId('ana-001') }),
        makeMember({ personaId: personaId('carlos-002') }),
      ])
      const result = await resolveDreamTeamGdvPlatformContext(makeInput({ reader }))

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.capabilities).toHaveLength(2)
      expect(result.contexts).toHaveLength(2)
      expect(new Set(result.capabilities.map((grant) => grant.scope.id)).size).toBe(1)
    })
  })

  describe('leadership diff', () => {
    it('detects removed leadership when previous memberships are missing in current', async () => {
      const previousMemberships = [makeMember({ personaId: ANA_PERSONA_ID, grupoId: TRANSIT_GROUP_ID })]
      const reader = makeReader([])
      const result = await resolveDreamTeamGdvPlatformContext(
        makeInput({ reader, previousMemberships }),
      )

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.leadershipChanges).toHaveLength(1)
      expect(result.leadershipChanges[0]).toEqual({
        personaId: ANA_PERSONA_ID,
        grupoId: TRANSIT_GROUP_ID,
        kind: 'removed',
        previous: previousMemberships[0],
        current: null,
      })
    })

    it('detects added leadership for new memberships', async () => {
      const current = [makeMember({ personaId: ANA_PERSONA_ID, grupoId: TRANSIT_GROUP_ID })]
      const reader = makeReader(current)
      const result = await resolveDreamTeamGdvPlatformContext(
        makeInput({ reader, previousMemberships: [] }),
      )

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.leadershipChanges).toHaveLength(1)
      expect(result.leadershipChanges[0]).toMatchObject({
        personaId: ANA_PERSONA_ID,
        grupoId: TRANSIT_GROUP_ID,
        kind: 'added',
        previous: null,
      })
    })

    it('reports unchanged leadership when previous and current match', async () => {
      const current = [makeMember()]
      const reader = makeReader(current)
      const result = await resolveDreamTeamGdvPlatformContext(
        makeInput({ reader, previousMemberships: [makeMember()] }),
      )

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.leadershipChanges).toHaveLength(1)
      expect(result.leadershipChanges[0]).toMatchObject({
        kind: 'unchanged',
        previous: current[0],
        current: current[0],
      })
    })

    it('does not flag removal when a previous leader is still active', async () => {
      const previousMemberships = [makeMember({ personaId: ANA_PERSONA_ID, grupoId: TRANSIT_GROUP_ID })]
      const current = [makeMember({ personaId: ANA_PERSONA_ID, grupoId: TRANSIT_GROUP_ID })]
      const reader = makeReader(current)
      const result = await resolveDreamTeamGdvPlatformContext(
        makeInput({ reader, previousMemberships }),
      )

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.leadershipChanges).toHaveLength(1)
      expect(result.leadershipChanges[0].kind).toBe('unchanged')
    })
  })

  describe('integration: caso Ana', () => {
    it('detects Ana leadership loss for Transit when she is no longer active', async () => {
      const previousMemberships = [
        makeMember({ personaId: ANA_PERSONA_ID, grupoId: TRANSIT_GROUP_ID, tipoLider: 'lider_grupo' }),
      ]
      const reader = makeReader([])
      const result = await resolveDreamTeamGdvPlatformContext(
        makeInput({ reader, previousMemberships }),
      )

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.contexts).toEqual([])
      expect(result.capabilities).toEqual([])
      expect(result.leadershipChanges).toEqual([
        {
          personaId: ANA_PERSONA_ID,
          grupoId: TRANSIT_GROUP_ID,
          kind: 'removed',
          previous: previousMemberships[0],
          current: null,
        },
      ])
    })
  })

  describe('defensive validation against resolvePlatformCapability', () => {
    it('skips capabilities whose scope is rejected by the resolver', async () => {
      const reader = makeReader([makeMember({ grupoId: '-malformed' })])
      const result = await resolveDreamTeamGdvPlatformContext(makeInput({ reader }))

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.capabilities).toEqual([])
      expect(result.contexts).toEqual([])
      expect(result.audit.grantCount).toBe(0)
    })
  })
})
