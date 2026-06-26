import {
  canReadGruposVidaGroup,
  filterGruposVidaRecordsByScope,
  resolveGruposVidaPlatformContext,
} from '@/lib/platform/adapters/grupos-vida'
import type { GruposVidaAdapterInput, GruposVidaDirectorEtapaAssignment, GruposVidaReadRepository } from '@/lib/platform/adapters/grupos-vida'
import type { PlatformSession } from '@/lib/platform/session/types'

const directorSession: PlatformSession = {
  personaId: 'persona-director',
  subjectAuthId: 'auth-director',
  globalRoles: [],
  contexts: [],
  capabilities: [],
}

const directorAssignment: GruposVidaDirectorEtapaAssignment = {
  directorEtapaId: 'director-etapa-1',
  personaId: 'persona-director',
  segmentoId: 'segmento-adultos',
  segmentoLabel: 'Adultos',
  assignedGroupIds: ['grupo-norte', 'grupo-sur'],
}

function createReader(assignments: readonly GruposVidaDirectorEtapaAssignment[]): GruposVidaReadRepository {
  return {
    findDirectorEtapaAssignmentsByPersonaId: jest.fn().mockResolvedValue(assignments),
  }
}

describe('Grupos de Vida platform read adapter', () => {
  it('resolves the expected platform context for an authorized director de etapa', async () => {
    const reader = createReader([directorAssignment])

    const result = await resolveGruposVidaPlatformContext({ session: directorSession, reader })

    expect(reader.findDirectorEtapaAssignmentsByPersonaId).toHaveBeenCalledWith('persona-director')
    expect(result).toEqual({
      ok: true,
      contexts: [{ experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'segmento-adultos', label: 'Grupos de Vida — Adultos' }],
      capabilities: [{ key: 'grupos_vida.stage.read', experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'segmento-adultos', source: 'gdv:director_etapa' }],
      scope: { stageIds: ['segmento-adultos'], groupIds: ['grupo-norte', 'grupo-sur'] },
      audit: { decision: 'allowed', personaId: 'persona-director', assignmentCount: 1, exposedGroupCount: 2 },
    })
  })

  it.each([
    { label: 'undefined session', session: undefined },
    { label: 'null session', session: null },
    { label: 'blank backend auth subject', session: { ...directorSession, subjectAuthId: '   ' }, expectedPersonaId: 'persona-director' },
    { label: 'malformed persona scope', session: { ...directorSession, personaId: '../persona-director' } },
  ] satisfies Array<{ label: string; session: GruposVidaAdapterInput['session']; expectedPersonaId?: string }>)('fails closed for $label before reading assignments', async ({ session, expectedPersonaId }) => {
    const reader = createReader([directorAssignment])

    const result = await resolveGruposVidaPlatformContext({ session, reader })

    expect(reader.findDirectorEtapaAssignmentsByPersonaId).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      reason: 'session_required',
      contexts: [],
      capabilities: [],
      scope: { stageIds: [], groupIds: [] },
      audit: { decision: 'denied', reason: 'session_required', ...(expectedPersonaId ? { personaId: expectedPersonaId } : {}), assignmentCount: 0, exposedGroupCount: 0 },
    })
  })

  it('fails closed for a user without Grupos de Vida scope', async () => {
    const reader = createReader([])

    const result = await resolveGruposVidaPlatformContext({ session: directorSession, reader })

    expect(result).toEqual({
      ok: false,
      reason: 'missing_gdv_scope',
      contexts: [],
      capabilities: [],
      scope: { stageIds: [], groupIds: [] },
      audit: { decision: 'denied', reason: 'missing_gdv_scope', personaId: 'persona-director', assignmentCount: 0, exposedGroupCount: 0 },
    })
  })

  it('fails closed when a director assignment does not expose any explicit group scope', async () => {
    const reader = createReader([{ ...directorAssignment, assignedGroupIds: [] }])

    const result = await resolveGruposVidaPlatformContext({ session: directorSession, reader })

    expect(result).toEqual({
      ok: false,
      reason: 'invalid_gdv_scope',
      contexts: [],
      capabilities: [],
      scope: { stageIds: [], groupIds: [] },
      audit: { decision: 'denied', reason: 'invalid_gdv_scope', personaId: 'persona-director', assignmentCount: 0, exposedGroupCount: 0 },
    })
  })

  it('does not grant Grupos de Vida permissions from padre or tutor family relationships', async () => {
    const parentSession: PlatformSession = { ...directorSession, personaId: 'persona-padre', subjectAuthId: 'auth-padre' }
    const childAssignment: GruposVidaDirectorEtapaAssignment = {
      ...directorAssignment,
      directorEtapaId: 'director-child-waumba',
      personaId: 'child-waumba',
      segmentoId: 'segmento-ninos',
      segmentoLabel: 'Niños',
      assignedGroupIds: ['grupo-child-waumba'],
    }
    const reader: GruposVidaReadRepository = {
      findDirectorEtapaAssignmentsByPersonaId: jest.fn(async (personaId: string) => {
        if (personaId === 'child-waumba') return [childAssignment]
        if (personaId === 'child-insideout') return [{ ...childAssignment, personaId, assignedGroupIds: ['grupo-child-insideout'] }]
        return []
      }),
    }

    const result = await resolveGruposVidaPlatformContext({
      session: parentSession,
      reader,
    })

    expect(result).toMatchObject({ ok: false, reason: 'missing_gdv_scope', capabilities: [], scope: { groupIds: [] } })
    expect(reader.findDirectorEtapaAssignmentsByPersonaId).toHaveBeenCalledWith('persona-padre')
    expect(reader.findDirectorEtapaAssignmentsByPersonaId).not.toHaveBeenCalledWith('child-waumba')
    expect(reader.findDirectorEtapaAssignmentsByPersonaId).not.toHaveBeenCalledWith('child-insideout')
  })

  it('keeps the adapter input boundary free from unused family relationship data', () => {
    const inputWithoutFamilySurface = {
      session: directorSession,
      reader: createReader([]),
      // @ts-expect-error Family relationships are context-only and must not be accepted by the GDV adapter boundary.
      familyRelations: [{ personaId: 'persona-padre', relatedPersonaId: 'child-waumba', type: 'padre' }],
    } satisfies GruposVidaAdapterInput

    expect(inputWithoutFamilySurface.familyRelations).toEqual([{ personaId: 'persona-padre', relatedPersonaId: 'child-waumba', type: 'padre' }])
  })

  it('does not copy or create cross-experience permissions', async () => {
    const reader = createReader([directorAssignment])
    const sessionWithOtherExperience: PlatformSession = {
      ...directorSession,
      capabilities: [{ key: 'dps.team.serve', experience: 'dps', scopeType: 'equipo', scopeId: 'musica', source: 'dream-team' }],
    }

    const result = await resolveGruposVidaPlatformContext({ session: sessionWithOtherExperience, reader })

    expect(result).toMatchObject({ ok: true })
    expect(result.capabilities).toEqual([{ key: 'grupos_vida.stage.read', experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'segmento-adultos', source: 'gdv:director_etapa' }])
    expect(JSON.stringify(result)).not.toContain('dps.team.serve')
  })

  it('does not expose records outside the resolved Grupos de Vida scope', async () => {
    const reader = createReader([{ ...directorAssignment, assignedGroupIds: ['grupo-autorizado'] }])
    const result = await resolveGruposVidaPlatformContext({ session: directorSession, reader })
    if (!result.ok) throw new Error(`expected authorized scope, got ${result.reason}`)

    const visibleRecords = filterGruposVidaRecordsByScope(
      result.scope,
      [
        { grupoId: 'grupo-autorizado', name: 'Visible group' },
        { grupoId: 'grupo-externo', name: 'Hidden group' },
      ],
      (record) => record.grupoId,
    )

    expect(canReadGruposVidaGroup(result.scope, 'grupo-autorizado')).toBe(true)
    expect(canReadGruposVidaGroup(result.scope, 'grupo-externo')).toBe(false)
    expect(visibleRecords).toEqual([{ grupoId: 'grupo-autorizado', name: 'Visible group' }])
  })

  it('fails closed when adapter reads fail or mapped GDV scope is unsafe', async () => {
    const failingReader: GruposVidaReadRepository = {
      findDirectorEtapaAssignmentsByPersonaId: jest.fn().mockRejectedValue(new Error('database timeout')),
    }
    const malformedReader = createReader([{ ...directorAssignment, segmentoId: '../segmento-adultos' }])

    await expect(resolveGruposVidaPlatformContext({ session: directorSession, reader: failingReader })).resolves.toEqual({
      ok: false,
      reason: 'adapter_read_failed',
      contexts: [],
      capabilities: [],
      scope: { stageIds: [], groupIds: [] },
      audit: { decision: 'denied', reason: 'adapter_read_failed', personaId: 'persona-director', assignmentCount: 0, exposedGroupCount: 0 },
    })

    await expect(resolveGruposVidaPlatformContext({ session: directorSession, reader: malformedReader })).resolves.toMatchObject({
      ok: false,
      reason: 'invalid_gdv_scope',
      contexts: [],
      capabilities: [],
      scope: { stageIds: [], groupIds: [] },
      audit: { decision: 'denied', reason: 'invalid_gdv_scope' },
    })
  })
})
