import { findPlatformPersonaCandidates } from '@/lib/platform/persona'
import type { PlatformPersonaLookupActor, PlatformPersonaUsuario } from '@/lib/platform/persona'

const authorizedActor: PlatformPersonaLookupActor = {
  personaId: 'actor-persona-1',
  allowedFlows: ['registration'],
  allowedScopes: ['waumbaland:registration'],
}
const adaPersona: PlatformPersonaUsuario = {
  id: 'persona-ada',
  auth_id: 'auth-ada',
  nombre: 'Ada',
  apellido: 'Lovelace',
  email: 'ada.lovelace@example.com',
  telefono: '+54 9 11 1234-7890',
  cedula: 'ABC-123456',
  fecha_nacimiento: '1815-12-10',
}
const baseLookupInput = { actor: authorizedActor, flow: 'registration', requiredScope: 'waumbaland:registration' }

function createLookup(candidates: PlatformPersonaUsuario[]) {
  return { findCandidatesBySignals: jest.fn().mockResolvedValue(candidates) }
}

describe('Platform Persona lookup and dedupe base', () => {
  it('returns only minimized and masked candidate data for authorized Persona lookup', async () => {
    const personaLookup = createLookup([adaPersona])
    const result = await findPlatformPersonaCandidates({
      ...baseLookupInput,
      query: {
        email: ' Ada.Lovelace@Example.com ',
        telefono: '+54 (9) 11 1234-7890',
        cedula: 'ABC-123456',
        nombre: 'Ada',
        apellido: 'Lovelace',
        fechaNacimiento: '1815-12-10',
      },
      personaLookup,
    })

    expect(personaLookup.findCandidatesBySignals).toHaveBeenCalledWith({
      email: 'ada.lovelace@example.com',
      telefono: '5491112347890',
      cedula: 'abc123456',
      nombre: 'ada',
      apellido: 'lovelace',
      fechaNacimiento: '1815-12-10',
    })
    expect(result).toMatchObject({
      ok: true,
      decision: 'single_candidate',
      autoMerge: false,
      reviewRequired: false,
      candidates: [{
        personaId: 'persona-ada',
        displayName: 'A. L.',
        hasAuthAccount: true,
        matchedSignals: ['email', 'telefono', 'cedula', 'nombre', 'apellido', 'fechaNacimiento'],
        maskedSignals: { email: 'a***@example.com', telefono: '••••7890', cedula: '••••3456' },
      }],
      audit: { actorPersonaId: 'actor-persona-1', decision: 'lookup_allowed', resultCount: 1 },
    })
    for (const hidden of ['ada.lovelace@example.com', '+54 9 11 1234-7890', 'ABC-123456', 'auth-ada']) {
      expect(JSON.stringify(result)).not.toContain(hidden)
    }
  })

  it('fails closed for invalid input and keeps no-match responses non-enumerable', async () => {
    const invalidLookup = createLookup([adaPersona])
    const invalid = await findPlatformPersonaCandidates({ ...baseLookupInput, query: { nombre: 'A' }, personaLookup: invalidLookup })
    expect(invalidLookup.findCandidatesBySignals).not.toHaveBeenCalled()
    expect(invalid).toMatchObject({
      ok: false,
      reason: 'invalid_query',
      candidates: [],
      audit: { decision: 'lookup_denied', reason: 'invalid_query', signalNames: ['nombre'], resultCount: 0 },
    })

    const malformedLookup = createLookup([adaPersona])
    for (const query of [{ email: 'ada@' }, { nombre: 'Ada', apellido: 'Lovelace', fechaNacimiento: '1815-99-99' }]) {
      const malformed = await findPlatformPersonaCandidates({ ...baseLookupInput, query, personaLookup: malformedLookup })
      expect(malformed).toMatchObject({ ok: false, reason: 'invalid_query', candidates: [] })
    }
    expect(malformedLookup.findCandidatesBySignals).not.toHaveBeenCalled()

    const noMatch = await findPlatformPersonaCandidates({
      ...baseLookupInput,
      query: { email: 'missing.person@example.com' },
      personaLookup: createLookup([]),
    })
    expect(noMatch).toMatchObject({
      ok: true,
      decision: 'no_match',
      autoMerge: false,
      reviewRequired: false,
      candidates: [],
      audit: { resultCount: 0, signalNames: ['email'] },
    })
    expect(JSON.stringify(noMatch)).not.toContain('missing.person@example.com')

    const failingLookup = { findCandidatesBySignals: jest.fn().mockRejectedValue(new Error('db leaked ada.lovelace@example.com')) }
    const failed = await findPlatformPersonaCandidates({ ...baseLookupInput, query: { email: 'ada.lovelace@example.com' }, personaLookup: failingLookup })
    expect(failed).toMatchObject({ ok: false, reason: 'lookup_failed', candidates: [], audit: { decision: 'lookup_failed', reason: 'lookup_failed', resultCount: 0 } })
    expect(JSON.stringify(failed)).not.toContain('ada.lovelace@example.com')
  })

  it('requires review for weak-only or conflicting non-tie matches without auto-merge', async () => {
    const weakOnly = await findPlatformPersonaCandidates({
      ...baseLookupInput,
      query: { email: 'ada.lovelace@example.com', nombre: 'Ada' },
      personaLookup: createLookup([{ ...adaPersona, email: null, telefono: null, cedula: null, apellido: null, fecha_nacimiento: null }]),
    })
    expect(weakOnly).toMatchObject({ ok: true, decision: 'single_candidate', autoMerge: false, reviewRequired: true, candidates: [{ matchedSignals: ['nombre'] }] })

    const result = await findPlatformPersonaCandidates({ ...baseLookupInput, query: { email: 'ada.lovelace@example.com', telefono: '+54 9 11 1234-7890' }, personaLookup: createLookup([
      { ...adaPersona, id: 'persona-email', telefono: null, cedula: null },
      { ...adaPersona, id: 'persona-phone', auth_id: null, email: null, cedula: null },
    ]) })

    expect(result).toMatchObject({
      ok: true,
      decision: 'ambiguous_candidates',
      autoMerge: false,
      reviewRequired: true,
      candidates: [
        { personaId: 'persona-email', displayName: 'A. L.', hasAuthAccount: true, matchedSignals: ['email'] },
        { personaId: 'persona-phone', displayName: 'A. L.', hasAuthAccount: false, matchedSignals: ['telefono'] },
      ],
      audit: { resultCount: 2, reviewRequired: true },
    })
  })

  it('denies lookup outside actor, flow, or required scope boundaries', async () => {
    const personaLookup = createLookup([adaPersona])
    const attempts = await Promise.all([
      findPlatformPersonaCandidates({ actor: null, flow: 'registration', requiredScope: 'waumbaland:registration', query: { email: 'ada@example.com' }, personaLookup }),
      findPlatformPersonaCandidates({ ...baseLookupInput, flow: 'support', query: { email: 'ada@example.com' }, personaLookup }),
      findPlatformPersonaCandidates({ ...baseLookupInput, actor: { ...authorizedActor, allowedScopes: [] }, query: { email: 'ada@example.com' }, personaLookup }),
    ])

    expect(personaLookup.findCandidatesBySignals).not.toHaveBeenCalled()
    expect(attempts.map((result) => result.ok ? null : result.reason)).toEqual(['actor_required', 'flow_not_allowed', 'missing_required_scope'])
    for (const result of attempts) {
      expect(result).toMatchObject({ candidates: [], audit: { decision: 'lookup_denied', resultCount: 0 } })
      expect(JSON.stringify(result)).not.toContain('ada@example.com')
    }
  })
})
