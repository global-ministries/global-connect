/**
 * W01 — DT-006 — Pastoral capability resolver.
 * Pure function resolving pastoral capabilities, same shape as resolveOperatingCoreCapability.
 */
import { resolvePastoralCapability } from '@/lib/platform/pastoral/capabilities'
import type { PastoralSessionContext } from '@/lib/platform/pastoral/capabilities'

describe('resolvePastoralCapability', () => {
  describe('denies when actor is missing', () => {
    it('denies with actor_required when session is null', () => {
      const ctx: PastoralSessionContext = {
        session: null,
        requiredCapability: 'pastoral.one_on_one.create',
        flow: 'api',
      }
      const result = resolvePastoralCapability(ctx)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('actor_required')
    })

    it('denies with actor_required when personaId is empty', () => {
      const ctx: PastoralSessionContext = {
        session: { personaId: '', allowedFlows: ['api'] },
        requiredCapability: 'pastoral.one_on_one.create',
        flow: 'api',
      }
      const result = resolvePastoralCapability(ctx)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('actor_required')
    })
  })

  describe('denies when flow is not allowed', () => {
    it('denies with flow_not_allowed when flow not in allowedFlows', () => {
      const ctx: PastoralSessionContext = {
        session: { personaId: 'carlos', allowedFlows: ['dashboard'] },
        requiredCapability: 'pastoral.one_on_one.create',
        flow: 'api',
      }
      const result = resolvePastoralCapability(ctx)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('flow_not_allowed')
    })
  })

  describe('denies when capability is unknown', () => {
    it('denies with unknown_capability for non-existent capability', () => {
      const ctx: PastoralSessionContext = {
        session: { personaId: 'carlos', allowedFlows: ['api'] },
        requiredCapability: 'pastoral.nonexistent.capability',
        flow: 'api',
      }
      const result = resolvePastoralCapability(ctx)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('unknown_capability')
    })
  })

  describe('denies when grant is missing', () => {
    it('denies with missing_required_capability when actor has no grants', () => {
      const ctx: PastoralSessionContext = {
        session: { personaId: 'stranger', allowedFlows: ['api'] },
        requiredCapability: 'pastoral.metrics.read',
        flow: 'api',
      }
      const result = resolvePastoralCapability(ctx)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('missing_required_capability')
    })
  })

  describe('allows when grant matches required capability', () => {
    it('allows pastoral.one_on_one.create when granted', () => {
      const ctx: PastoralSessionContext = {
        session: {
          personaId: 'carlos',
          allowedFlows: ['api'],
          grants: [
            { key: 'pastoral.one_on_one.create', scope: { experience: 'pastoral', type: 'one_on_one' }, source: 'pastoral-seeding' },
          ],
        },
        requiredCapability: 'pastoral.one_on_one.create',
        flow: 'api',
      }
      const result = resolvePastoralCapability(ctx)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.decision).toBe('allowed')
      expect(result.grant.key).toBe('pastoral.one_on_one.create')
    })

    it('allows pastoral.metrics.read when granted with experience scope', () => {
      const ctx: PastoralSessionContext = {
        session: {
          personaId: 'carlos',
          allowedFlows: ['dashboard'],
          grants: [
            { key: 'pastoral.metrics.read', scope: { experience: 'pastoral', type: 'experience' }, source: 'pastoral-seeding' },
          ],
        },
        requiredCapability: 'pastoral.metrics.read',
        flow: 'dashboard',
      }
      const result = resolvePastoralCapability(ctx)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.decision).toBe('allowed')
    })

    it('allows pastoral.read.all when granted', () => {
      const ctx: PastoralSessionContext = {
        session: {
          personaId: 'pablo-pastor',
          allowedFlows: ['api'],
          grants: [
            { key: 'pastoral.read.all', scope: { experience: 'pastoral', type: 'experience' }, source: 'pastoral-seeding' },
          ],
        },
        requiredCapability: 'pastoral.read.all',
        flow: 'api',
      }
      const result = resolvePastoralCapability(ctx)
      expect(result.ok).toBe(true)
    })
  })

  describe('separates read vs write capabilities (P5)', () => {
    it('pastoral.read.all does NOT grant pastoral.one_on_one.validate_step', () => {
      const ctx: PastoralSessionContext = {
        session: {
          personaId: 'pablo-pastor',
          allowedFlows: ['api'],
          grants: [
            { key: 'pastoral.read.all', scope: { experience: 'pastoral', type: 'experience' }, source: 'pastoral-seeding' },
          ],
        },
        requiredCapability: 'pastoral.one_on_one.validate_step',
        flow: 'api',
      }
      const result = resolvePastoralCapability(ctx)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('missing_required_capability')
    })

    it('pastoral.read.all does NOT grant pastoral.triada.disband', () => {
      const ctx: PastoralSessionContext = {
        session: {
          personaId: 'pablo-pastor',
          allowedFlows: ['api'],
          grants: [
            { key: 'pastoral.read.all', scope: { experience: 'pastoral', type: 'experience' }, source: 'pastoral-seeding' },
          ],
        },
        requiredCapability: 'pastoral.triada.disband',
        flow: 'api',
      }
      const result = resolvePastoralCapability(ctx)
      expect(result.ok).toBe(false)
    })
  })

  describe('audit trail', () => {
    it('returns audit with actorPersonaId on success', () => {
      const ctx: PastoralSessionContext = {
        session: {
          personaId: 'carlos',
          allowedFlows: ['api'],
          grants: [
            { key: 'pastoral.one_on_one.create', scope: { experience: 'pastoral', type: 'one_on_one' }, source: 'pastoral-seeding' },
          ],
        },
        requiredCapability: 'pastoral.one_on_one.create',
        flow: 'api',
      }
      const result = resolvePastoralCapability(ctx)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.audit.actorPersonaId).toBe('carlos')
      expect(result.audit.decision).toBe('allowed')
      expect(result.audit.requiredCapability).toBe('pastoral.one_on_one.create')
    })

    it('returns audit with reason on denial', () => {
      const ctx: PastoralSessionContext = {
        session: { personaId: 'stranger', allowedFlows: ['api'] },
        requiredCapability: 'pastoral.crisis.detect',
        flow: 'api',
      }
      const result = resolvePastoralCapability(ctx)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.audit.decision).toBe('denied')
      expect(result.audit.requiredCapability).toBe('pastoral.crisis.detect')
    })
  })
})
