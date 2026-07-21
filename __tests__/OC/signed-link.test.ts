/**
 * S19 — Signed link tests.
 *
 * Tests:
 *   - generateSignedLink → verifySignedLink round trip
 *   - expired token rejection
 *   - tampered signature rejection
 *   - malformed token rejection
 *   - TTL clamping (min 1 day, max 30 days)
 */

import { generateSignedLink, verifySignedLink, DEFAULT_SIGNED_LINK_TTL_DAYS, MAX_SIGNED_LINK_TTL_DAYS } from '@/lib/platform/operating-core/notifications/signed-link'

const SECRET = 'test-secret-key-for-hmac'
const NOW = '2026-07-20T12:00:00.000Z'

// ─── Round-trip generate → verify ─────────────────────────────────────────────

describe('signed-link round trip', () => {
  it('should generate a token that verifies successfully', () => {
    const input = {
      resourceType: 'registration_form',
      resourceId: 'res-123',
      personaId: 'per-456',
      ttlDays: 7,
      secret: SECRET,
      nowIso: NOW,
    }
    const token = generateSignedLink(input)
    expect(token.token).toBeTruthy()
    expect(token.token.length).toBeGreaterThan(0)
    expect(token.resourceType).toBe('registration_form')
    expect(token.resourceId).toBe('res-123')
    expect(token.personaId).toBe('per-456')

    const result = verifySignedLink(token.token, SECRET, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.resourceType).toBe('registration_form')
      expect(result.payload.resourceId).toBe('res-123')
      expect(result.payload.personaId).toBe('per-456')
    }
  })

  it('should include expiresAt in the generated token', () => {
    const input = {
      resourceType: 'manual_registration',
      resourceId: 'res-789',
      personaId: null,
      ttlDays: 7,
      secret: SECRET,
      nowIso: NOW,
    }
    const token = generateSignedLink(input)
    expect(token.expiresAt).toBeTruthy()
    // 7 days from NOW
    expect(token.expiresAt).toBe('2026-07-27T12:00:00.000Z')
  })

  it('should handle null personaId', () => {
    const input = {
      resourceType: 'manual_registration',
      resourceId: 'res-abc',
      personaId: null,
      ttlDays: 7,
      secret: SECRET,
      nowIso: NOW,
    }
    const token = generateSignedLink(input)
    const result = verifySignedLink(token.token, SECRET, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.personaId).toBeNull()
    }
  })
})

// ─── Expired token ────────────────────────────────────────────────────────────

describe('expired token', () => {
  it('should reject a token when current time is past expiresAt', () => {
    const input = {
      resourceType: 'registration_form',
      resourceId: 'res-123',
      personaId: null,
      ttlDays: 7,
      secret: SECRET,
      nowIso: NOW,
    }
    const token = generateSignedLink(input)
    // Advance time past expiry
    const expiredNow = '2026-07-28T00:00:00.000Z'
    const result = verifySignedLink(token.token, SECRET, expiredNow)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('expired')
    }
  })

  it('should reject a token at exactly the expiry moment', () => {
    const input = {
      resourceType: 'registration_form',
      resourceId: 'res-123',
      personaId: null,
      ttlDays: 7,
      secret: SECRET,
      nowIso: NOW,
    }
    const token = generateSignedLink(input)
    // Exactly at expiry
    const atExpiry = '2026-07-27T12:00:00.000Z'
    const result = verifySignedLink(token.token, SECRET, atExpiry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('expired')
    }
  })
})

// ─── Tampered signature ───────────────────────────────────────────────────────

describe('tampered signature', () => {
  it('should reject when token is modified after generation', () => {
    const input = {
      resourceType: 'registration_form',
      resourceId: 'res-123',
      personaId: null,
      ttlDays: 7,
      secret: SECRET,
      nowIso: NOW,
    }
    const token = generateSignedLink(input)
    // Tamper with the token by changing one character
    const tamperedToken = token.token.slice(0, -5) + 'XXXXX'
    const result = verifySignedLink(tamperedToken, SECRET, NOW)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('invalid_signature')
    }
  })

  it('should reject when verified with wrong secret', () => {
    const input = {
      resourceType: 'registration_form',
      resourceId: 'res-123',
      personaId: null,
      ttlDays: 7,
      secret: SECRET,
      nowIso: NOW,
    }
    const token = generateSignedLink(input)
    const result = verifySignedLink(token.token, 'wrong-secret', NOW)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('invalid_signature')
    }
  })
})

// ─── Malformed token ──────────────────────────────────────────────────────────

describe('malformed token', () => {
  it('should reject a token without a dot separator', () => {
    const result = verifySignedLink('no-dot-here', SECRET, NOW)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('malformed')
    }
  })

  it('should reject an empty string', () => {
    const result = verifySignedLink('', SECRET, NOW)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('malformed')
    }
  })

  it('should reject a token with only a dot', () => {
    const result = verifySignedLink('.', SECRET, NOW)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('malformed')
    }
  })
})

// ─── TTL clamping ──────────────────────────────────────────────────────────────

describe('TTL clamping', () => {
  it('should use DEFAULT_SIGNED_LINK_TTL_DAYS when not specified', () => {
    expect(DEFAULT_SIGNED_LINK_TTL_DAYS).toBe(7)
  })

  it('should use MAX_SIGNED_LINK_TTL_DAYS as the ceiling', () => {
    expect(MAX_SIGNED_LINK_TTL_DAYS).toBe(30)
  })

  it('should clamp TTL to max 30 days', () => {
    const input = {
      resourceType: 'registration_form',
      resourceId: 'res-123',
      personaId: null,
      ttlDays: 999, // way over max
      secret: SECRET,
      nowIso: NOW,
    }
    const token = generateSignedLink(input)
    // Should be capped at 30 days from NOW
    const expectedExpiry = new Date(NOW)
    expectedExpiry.setDate(expectedExpiry.getDate() + 30)
    expect(token.expiresAt).toBe(expectedExpiry.toISOString())
  })

  it('should accept TTL of exactly 30 days', () => {
    const input = {
      resourceType: 'registration_form',
      resourceId: 'res-123',
      personaId: null,
      ttlDays: 30,
      secret: SECRET,
      nowIso: NOW,
    }
    const token = generateSignedLink(input)
    const result = verifySignedLink(token.token, SECRET, NOW)
    expect(result.ok).toBe(true)
  })
})
