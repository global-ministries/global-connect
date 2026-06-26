import { buildPlatformSession } from '@/lib/platform/session/build'
import type { PlatformSessionPersona } from '@/lib/platform/session/types'

const linkedPersona: PlatformSessionPersona = {
  id: 'persona-auth-1',
  authId: 'auth-1',
}

describe('PlatformSession builder', () => {
  it('derives authenticated persona from the backend auth subject', async () => {
    const personaLookup = {
      findByAuthId: jest.fn().mockResolvedValue(linkedPersona),
    }

    const result = await buildPlatformSession({
      subjectAuthId: 'auth-1',
      personaLookup,
    })

    expect(personaLookup.findByAuthId).toHaveBeenCalledWith('auth-1')
    expect(result).toEqual({
      ok: true,
      session: {
        personaId: 'persona-auth-1',
        subjectAuthId: 'auth-1',
        globalRoles: [],
        contexts: [],
        capabilities: [],
      },
      warnings: [],
    })
  })

  it('fails closed for blank backend auth without calling persona lookup', async () => {
    const personaLookup = {
      findByAuthId: jest.fn(),
    }

    const result = await buildPlatformSession({
      subjectAuthId: '   ',
      personaLookup,
    })

    expect(personaLookup.findByAuthId).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false, reason: 'unauthenticated', warnings: [] })
  })

  it('fails closed for missing backend auth without calling persona lookup', async () => {
    const personaLookup = {
      findByAuthId: jest.fn(),
    }

    const result = await buildPlatformSession({
      subjectAuthId: null,
      clientPersonaId: 'forged-persona',
      personaLookup,
    })

    expect(personaLookup.findByAuthId).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      reason: 'unauthenticated',
      warnings: [{ code: 'client_persona_id_ignored', clientPersonaId: 'forged-persona' }],
    })
  })

  it('ignores a client-provided personaId when it differs from the backend subject', async () => {
    const personaLookup = {
      findByAuthId: jest.fn().mockResolvedValue(linkedPersona),
    }

    const result = await buildPlatformSession({
      subjectAuthId: 'auth-1',
      clientPersonaId: 'forged-persona',
      personaLookup,
    })

    expect(result).toMatchObject({
      ok: true,
      session: { personaId: 'persona-auth-1', subjectAuthId: 'auth-1' },
      warnings: [{ code: 'client_persona_id_ignored', clientPersonaId: 'forged-persona' }],
    })
  })

  it('ignores a client-provided personaId even when it matches the resolved Persona', async () => {
    const personaLookup = {
      findByAuthId: jest.fn().mockResolvedValue(linkedPersona),
    }

    const result = await buildPlatformSession({
      subjectAuthId: 'auth-1',
      clientPersonaId: 'persona-auth-1',
      personaLookup,
    })

    expect(personaLookup.findByAuthId).toHaveBeenCalledWith('auth-1')
    expect(personaLookup.findByAuthId).not.toHaveBeenCalledWith('persona-auth-1')
    expect(result).toEqual({
      ok: true,
      session: {
        personaId: 'persona-auth-1',
        subjectAuthId: 'auth-1',
        globalRoles: [],
        contexts: [],
        capabilities: [],
      },
      warnings: [{ code: 'client_persona_id_ignored', clientPersonaId: 'persona-auth-1' }],
    })
  })

  it('denies direct PlatformSession access for a persona without linked auth', async () => {
    const personaWithoutAuth: PlatformSessionPersona = {
      ...linkedPersona,
      id: 'visitor-persona',
      authId: null,
    }
    const personaLookup = {
      findByAuthId: jest.fn().mockResolvedValue(personaWithoutAuth),
    }

    const result = await buildPlatformSession({
      subjectAuthId: 'auth-visitor',
      clientPersonaId: 'visitor-persona',
      personaLookup,
    })

    expect(result).toEqual({
      ok: false,
      reason: 'persona_not_linked_to_backend_auth',
      warnings: [{ code: 'client_persona_id_ignored', clientPersonaId: 'visitor-persona' }],
    })
  })

  it('denies a Persona linked to a different backend auth subject', async () => {
    const personaLookup = {
      findByAuthId: jest.fn().mockResolvedValue({
        id: 'persona-other-auth',
        authId: 'auth-other',
      }),
    }

    const result = await buildPlatformSession({
      subjectAuthId: 'auth-1',
      personaLookup,
    })

    expect(result).toEqual({ ok: false, reason: 'persona_not_linked_to_backend_auth', warnings: [] })
  })

  it('fails closed when backend auth has no linked Persona row', async () => {
    const personaLookup = {
      findByAuthId: jest.fn().mockResolvedValue(null),
    }

    const result = await buildPlatformSession({
      subjectAuthId: 'auth-missing-persona',
      personaLookup,
    })

    expect(result).toEqual({ ok: false, reason: 'persona_not_linked_to_backend_auth', warnings: [] })
  })

  it('fails closed when persona lookup rejects', async () => {
    const personaLookup = {
      findByAuthId: jest.fn().mockRejectedValue(new Error('lookup timeout')),
    }

    await expect(buildPlatformSession({
      subjectAuthId: 'auth-1',
      personaLookup,
    })).resolves.toEqual({
      ok: false,
      reason: 'persona_lookup_failed',
      warnings: [],
    })
  })
})
