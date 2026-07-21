/**
 * S11 TDD RED — public-token-repository
 * Verifies PublicTokensRepository interface contract via in-memory fake.
 */
import { createInMemoryPublicTokensRepository } from '@/lib/platform/operating-core/public-tokens/public-token-repository-fake'
import type { PublicTokensRepository } from '@/lib/platform/operating-core/public-tokens/public-token-repository'

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

function futureDate(offsetSeconds = 3600): string {
  return new Date(Date.now() + offsetSeconds * 1000).toISOString()
}

function pastDate(offsetSeconds = -3600): string {
  return new Date(Date.now() + offsetSeconds * 1000).toISOString()
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('PublicTokensRepository', () => {
  let repo: PublicTokensRepository

  beforeEach(() => {
    repo = createInMemoryPublicTokensRepository()
  })

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  describe('create', () => {
    it('creates a public token with correct fields', async () => {
      const input = {
        tokenHash: 'hash-001',
        resourceType: 'registration_link',
        resourceId: 'event-001',
        personaId: null,
        expiresAt: futureDate(),
        capturedByPersonaId: null,
      }
      const row = await repo.create(input)
      expect(row.token_hash).toBe('hash-001')
      expect(row.resource_type).toBe('registration_link')
      expect(row.resource_id).toBe('event-001')
      expect(row.consumed_at).toBeNull()
    })

    it('creates a token with pre-assigned persona_id', async () => {
      const input = {
        tokenHash: 'hash-002',
        resourceType: 'manual_registration',
        resourceId: 'form-001',
        personaId: 'persona-preassigned',
        expiresAt: futureDate(),
        capturedByPersonaId: 'creator-persona',
        metadata: { role: 'vip' },
      }
      const row = await repo.create(input)
      expect(row.persona_id).toBe('persona-preassigned')
      expect(row.captured_by_persona_id).toBe('creator-persona')
      expect(row.metadata).toEqual({ role: 'vip' })
    })
  })

  // ---------------------------------------------------------------------------
  // findByHash
  // ---------------------------------------------------------------------------

  describe('findByHash', () => {
    it('returns null for non-existent token', async () => {
      const result = await repo.findByHash('non-existent')
      expect(result).toBeNull()
    })

    it('returns token after creation', async () => {
      const input = {
        tokenHash: 'hash-findme',
        resourceType: 'registration_link',
        resourceId: 'event-001',
        personaId: null,
        expiresAt: futureDate(),
        capturedByPersonaId: null,
      }
      await repo.create(input)
      const found = await repo.findByHash('hash-findme')
      expect(found).not.toBeNull()
      expect(found!.token_hash).toBe('hash-findme')
    })
  })

  // ---------------------------------------------------------------------------
  // claim — basic
  // ---------------------------------------------------------------------------

  describe('claim', () => {
    it('returns ok:true with row when token is successfully claimed', async () => {
      await repo.create({
        tokenHash: 'hash-claim-ok',
        resourceType: 'registration_link',
        resourceId: 'event-001',
        personaId: null,
        expiresAt: futureDate(),
        capturedByPersonaId: null,
      })
      const outcome = await repo.claim('hash-claim-ok', 'persona-claimant')
      expect(outcome.ok).toBe(true)
      if (!outcome.ok) return
      expect(outcome.row.consumed_at).not.toBeNull()
      expect(outcome.row.consumed_by_persona_id).toBe('persona-claimant')
    })

    it('returns ok:false token_not_found for non-existent token', async () => {
      const outcome = await repo.claim('non-existent-hash', null)
      expect(outcome.ok).toBe(false)
      if (outcome.ok) return
      expect(outcome.reason).toBe('token_not_found')
    })

    it('returns ok:false token_expired for expired token', async () => {
      await repo.create({
        tokenHash: 'hash-expired',
        resourceType: 'registration_link',
        resourceId: 'event-001',
        personaId: null,
        expiresAt: pastDate(),
        capturedByPersonaId: null,
      })
      const outcome = await repo.claim('hash-expired', null)
      expect(outcome.ok).toBe(false)
      if (outcome.ok) return
      expect(outcome.reason).toBe('token_expired')
    })
  })

  // ---------------------------------------------------------------------------
  // claim — double-claim race condition (CRITICAL)
  // ---------------------------------------------------------------------------

  describe('double-claim race condition', () => {
    it('two concurrent claim calls: only 1 returns ok:true, the other returns ok:false', async () => {
      await repo.create({
        tokenHash: 'hash-race',
        resourceType: 'registration_link',
        resourceId: 'event-001',
        personaId: null,
        expiresAt: futureDate(),
        capturedByPersonaId: null,
      })

      // Simulate two concurrent claim calls
      const [outcomeA, outcomeB] = await Promise.all([
        repo.claim('hash-race', 'persona-a'),
        repo.claim('hash-race', 'persona-b'),
      ])

      const winners = [outcomeA, outcomeB].filter((o) => o.ok)
      const losers = [outcomeA, outcomeB].filter((o) => !o.ok)

      // Exactly 1 winner, 1 loser
      expect(winners).toHaveLength(1)
      expect(losers).toHaveLength(1)

      // Loser reason should be token_not_found (already consumed)
      if (!losers[0].ok) {
        expect(losers[0].reason).toBe('token_not_found')
      }
    })

    it('5 concurrent claim calls: only 1 succeeds, 4 get token_not_found', async () => {
      await repo.create({
        tokenHash: 'hash-race-5',
        resourceType: 'registration_link',
        resourceId: 'event-001',
        personaId: null,
        expiresAt: futureDate(),
        capturedByPersonaId: null,
      })

      const outcomes = await Promise.all([
        repo.claim('hash-race-5', 'p1'),
        repo.claim('hash-race-5', 'p2'),
        repo.claim('hash-race-5', 'p3'),
        repo.claim('hash-race-5', 'p4'),
        repo.claim('hash-race-5', 'p5'),
      ])

      const winners = outcomes.filter((o) => o.ok)
      const losers = outcomes.filter((o) => !o.ok)

      expect(winners).toHaveLength(1)
      expect(losers).toHaveLength(4)

      for (const loser of losers) {
        if (!loser.ok) {
          expect(loser.reason).toBe('token_not_found')
        }
      }
    })

    it('10 parallel claim calls: only 1 succeeds (stress test)', async () => {
      await repo.create({
        tokenHash: 'hash-race-10',
        resourceType: 'registration_link',
        resourceId: 'event-001',
        personaId: null,
        expiresAt: futureDate(),
        capturedByPersonaId: null,
      })

      const outcomes = await Promise.all(
        Array.from({ length: 10 }, (_, i) => repo.claim('hash-race-10', `persona-${i}`)),
      )

      const winners = outcomes.filter((o) => o.ok)
      expect(winners).toHaveLength(1)
    })
  })

  // ---------------------------------------------------------------------------
  // delete
  // ---------------------------------------------------------------------------

  describe('delete', () => {
    it('removes token from repository', async () => {
      await repo.create({
        tokenHash: 'hash-delete',
        resourceType: 'registration_link',
        resourceId: 'event-001',
        personaId: null,
        expiresAt: futureDate(),
        capturedByPersonaId: null,
      })
      await repo.delete('hash-delete')
      const found = await repo.findByHash('hash-delete')
      expect(found).toBeNull()
    })

    it('delete is idempotent (no error if already deleted)', async () => {
      await expect(repo.delete('non-existent')).resolves.not.toThrow()
    })
  })

  // ---------------------------------------------------------------------------
  // claim — already consumed
  // ---------------------------------------------------------------------------

  describe('claim — already consumed', () => {
    it('returns ok:false token_not_found after consumption', async () => {
      await repo.create({
        tokenHash: 'hash-consumed',
        resourceType: 'registration_link',
        resourceId: 'event-001',
        personaId: null,
        expiresAt: futureDate(),
        capturedByPersonaId: null,
      })
      await repo.claim('hash-consumed', 'persona-first')
      const second = await repo.claim('hash-consumed', 'persona-second')
      expect(second.ok).toBe(false)
      if (second.ok) return
      expect(second.reason).toBe('token_not_found')
    })
  })
})
