/**
 * S19 — Signed shared links with HMAC-SHA256 and configurable TTL.
 *
 * Default TTL: 7 days. Signed links are:
 * - Generated with a cryptographic HMAC-SHA256 signature
 * - Verified with constant-time comparison
 * - Revocable on consumption (caller marks consumed; this module provides verify)
 */

import { createHmac, randomBytes } from 'node:crypto'

import type { SignedLinkInput, SignedLinkToken, SignedLinkVerifyResult } from './notification-state-types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default TTL in days when not specified. */
export const DEFAULT_SIGNED_LINK_TTL_DAYS = 7

/** Maximum allowed TTL (30 days). */
export const MAX_SIGNED_LINK_TTL_DAYS = 30

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

/**
 * Encodes a payload + signature as a base64url string.
 */
function encodeToken(payloadJson: string, signature: string): string {
  const combined = `${payloadJson}.${signature}`
  return combined
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

/**
 * Splits a base64url token into [payloadJson, signature].
 * Returns null if malformed (missing dot separator).
 */
function decodeToken(token: string): { payloadJson: string; signature: string } | null {
  const lastDot = token.lastIndexOf('.')
  if (lastDot <= 0 || lastDot === token.length - 1) return null
  const payloadJson = token.slice(0, lastDot)
  const signature = token.slice(lastDot + 1)
  return { payloadJson, signature }
}

/**
 * Parses a JSON payload safely.
 */
function parsePayload(json: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Core signing
// ---------------------------------------------------------------------------

/**
 * Creates an HMAC-SHA256 signature over the payload string.
 */
function signPayload(payloadJson: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadJson).digest('base64url')
}

/**
 * Constant-time comparison to prevent timing attacks.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates a signed shared link token.
 *
 * @param input - resource metadata + secret + TTL + now reference
 * @returns SignedLinkToken with opaque URL-safe token and expires_at
 */
export function generateSignedLink(input: Readonly<SignedLinkInput>): SignedLinkToken {
  const { resourceType, resourceId, personaId, ttlDays, secret, nowIso } = input

  const clampedTtl = Math.min(Math.max(ttlDays, 1), MAX_SIGNED_LINK_TTL_DAYS)
  const nowMs = new Date(nowIso).getTime()
  const expiresMs = nowMs + clampedTtl * 24 * 60 * 60 * 1000
  const expiresAt = new Date(expiresMs).toISOString()
  const nonce = randomBytes(8).toString('base64url')

  const payloadObj: Record<string, unknown> = {
    rt: resourceType,
    ri: resourceId,
    pi: personaId,
    ea: expiresAt,
    n: nonce,
  }
  const payloadJson = JSON.stringify(payloadObj)
  const signature = signPayload(payloadJson, secret)
  const token = encodeToken(payloadJson, signature)

  return Object.freeze({
    token,
    expiresAt,
    resourceType,
    resourceId,
    personaId,
  })
}

/**
 * Verifies a signed link token.
 *
 * @param token   - the opaque token string
 * @param secret  - HMAC secret (must match the one used to generate)
 * @param nowIso  - ISO timestamp for expiry check
 * @returns SignedLinkVerifyResult — ok=true with payload, or ok=false with reason
 */
export function verifySignedLink(
  token: string,
  secret: string,
  nowIso: string,
): SignedLinkVerifyResult {
  const decoded = decodeToken(token)
  if (!decoded) {
    return { ok: false, reason: 'malformed' }
  }

  const { payloadJson, signature } = decoded

  // Re-compute signature and verify with constant-time comparison
  const expectedSignature = signPayload(payloadJson, secret)
  if (!constantTimeEqual(signature, expectedSignature)) {
    return { ok: false, reason: 'invalid_signature' }
  }

  // Parse and validate payload structure
  const payload = parsePayload(payloadJson)
  if (!payload) {
    return { ok: false, reason: 'malformed' }
  }

  // Validate required fields
  const expiresAt = payload['ea']
  if (typeof expiresAt !== 'string') {
    return { ok: false, reason: 'malformed' }
  }

  const resourceType = payload['rt']
  const resourceId = payload['ri']
  if (typeof resourceType !== 'string' || typeof resourceId !== 'string') {
    return { ok: false, reason: 'malformed' }
  }

  // Check expiry
  const expiresMs = new Date(expiresAt).getTime()
  const nowMs = new Date(nowIso).getTime()
  if (expiresMs <= nowMs) {
    return { ok: false, reason: 'expired' }
  }

  return {
    ok: true,
    payload: Object.freeze({
      token,
      expiresAt,
      resourceType,
      resourceId,
      personaId: payload['pi'] as string | null,
    }),
  }
}
