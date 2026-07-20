/**
 * S11 — Threat matrix: token replay protection
 *
 * Verifies that replay attacks return the SAME outcome (404) as invalid tokens.
 * This prevents existence disclosure: an attacker cannot distinguish between
 * "token never existed" and "token was already consumed".
 *
 * Per spec: invalid/replay/expired → 404 (NOT 409)
 */
import { createInMemoryPublicTokensRepository } from '@/lib/platform/operating-core/public-tokens/public-token-repository-fake'
import type { PublicTokensRepository } from '@/lib/platform/operating-core/public-tokens/public-token-repository'

function futureDate(offsetSeconds = 3600): string {
  return new Date(Date.now() + offsetSeconds * 1000).toISOString()
}

function pastDate(offsetSeconds = -3600): string {
  return new Date(Date.now() + offsetSeconds * 1000).toISOString()
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('F(threat-matrix-token-replay) — S11 Token Replay Threat Matrix', () => {
  let repo: PublicTokensRepository

  beforeEach(() => {
    repo = createInMemoryPublicTokensRepository()
  })

  // ---------------------------------------------------------------------------
  // Replay scenario: 5 calls to same token
  // ---------------------------------------------------------------------------

  describe('replay scenario — 5 sequential calls to same token', () => {
    it('only 1st call succeeds, calls 2-5 all return token_not_found (404 equivalent)', async () => {
      await repo.create({
        tokenHash: 'hash-replay-seq',
        resourceType: 'registration_link',
        resourceId: 'event-001',
        personaId: null,
        expiresAt: futureDate(),
        capturedByPersonaId: null,
      })

      const results: Array<{ ok: boolean; reason?: string }> = []
      for (let i = 0; i < 5; i++) {
        const outcome = await repo.claim('hash-replay-seq', `persona-${i}`)
        results.push({ ok: outcome.ok, reason: outcome.ok ? undefined : outcome.reason })
      }

      // Exactly 1 success
      const successes = results.filter((r) => r.ok)
      expect(successes).toHaveLength(1)

      // 4 failures — all token_not_found (NOT 409, NOT 401, NOT 403)
      const failures = results.filter((r) => !r.ok)
      expect(failures).toHaveLength(4)
      for (const failure of failures) {
        expect(failure.reason).toBe('token_not_found')
      }
    })
  })

  // ---------------------------------------------------------------------------
  // Concurrent replay: 10 parallel calls
  // ---------------------------------------------------------------------------

  describe('concurrent replay — 10 parallel calls', () => {
    it('exactly 1 caller wins, 9 get token_not_found', async () => {
      await repo.create({
        tokenHash: 'hash-replay-parallel',
        resourceType: 'registration_link',
        resourceId: 'event-001',
        personaId: null,
        expiresAt: futureDate(),
        capturedByPersonaId: null,
      })

      const outcomes = await Promise.all(
        Array.from({ length: 10 }, (_, i) => repo.claim('hash-replay-parallel', `persona-${i}`)),
      )

      const winners = outcomes.filter((o) => o.ok)
      const losers = outcomes.filter((o) => !o.ok)

      expect(winners).toHaveLength(1)
      expect(losers).toHaveLength(9)

      // All losers: token_not_found (404 equivalent, NOT 409)
      for (const loser of losers) {
        if (!loser.ok) {
          expect(loser.reason).toBe('token_not_found')
        }
      }
    })
  })

  // ---------------------------------------------------------------------------
  // Edge cases: missing, empty, garbage tokens
  // ---------------------------------------------------------------------------

  describe('edge cases — missing, empty, garbage tokens', () => {
    it('missing token returns token_not_found', async () => {
      const outcome = await repo.claim('this-token-does-not-exist', null)
      expect(outcome.ok).toBe(false)
      if (outcome.ok) return
      expect(outcome.reason).toBe('token_not_found')
    })

    it('empty string token returns token_not_found', async () => {
      const outcome = await repo.claim('', null)
      expect(outcome.ok).toBe(false)
      if (outcome.ok) return
      expect(outcome.reason).toBe('token_not_found')
    })

    it('garbage token returns token_not_found', async () => {
      const outcome = await repo.claim('!!!!NOT_A_HASH!!!!', null)
      expect(outcome.ok).toBe(false)
      if (outcome.ok) return
      expect(outcome.reason).toBe('token_not_found')
    })

    it('expired token returns token_expired (NOT token_not_found — but treated as 404 at API layer)', async () => {
      await repo.create({
        tokenHash: 'hash-expired-edge',
        resourceType: 'registration_link',
        resourceId: 'event-001',
        personaId: null,
        expiresAt: pastDate(),
        capturedByPersonaId: null,
      })
      const outcome = await repo.claim('hash-expired-edge', null)
      expect(outcome.ok).toBe(false)
      if (outcome.ok) return
      // At the API layer, both token_expired and token_not_found → 404
      expect(['token_expired', 'token_not_found']).toContain(outcome.reason)
    })
  })

  // ---------------------------------------------------------------------------
  // Existence disclosure protection — replay must NOT distinguish from invalid
  // ---------------------------------------------------------------------------

  describe('existence disclosure protection', () => {
    it('replay of consumed token returns SAME code as non-existent token', async () => {
      // Token A: non-existent
      const nonExistent = await repo.claim('token-does-not-exist', null)

      // Token B: created and consumed
      await repo.create({
        tokenHash: 'token-consumed',
        resourceType: 'registration_link',
        resourceId: 'event-001',
        personaId: null,
        expiresAt: futureDate(),
        capturedByPersonaId: null,
      })
      await repo.claim('token-consumed', 'persona-winner')
      const consumedReplay = await repo.claim('token-consumed', 'persona-attacker')

      // Both MUST return the same reason (404 at API layer)
      expect(nonExistent.ok).toBe(false)
      expect(consumedReplay.ok).toBe(false)
      if (nonExistent.ok || consumedReplay.ok) return

      // The API maps both to 404 — attacker cannot tell them apart
      expect(nonExistent.reason).toBe(consumedReplay.reason)
    })
  })
})
