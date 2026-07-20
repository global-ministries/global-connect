/**
 * S11 — PublicTokensRepository interface
 * Contract for public token lifecycle with single-use atomic claim semantics.
 */
import type { OperatingCorePublicTokenRow, OperatingCoreClaimOutcome } from './public-token-sql-row'

export interface CreatePublicTokenInput {
  /** Pre-hashed token (call hashPublicToken first) */
  tokenHash: string
  resourceType: string
  resourceId: string
  personaId: string | null
  expiresAt: string // ISO timestamp
  capturedByPersonaId: string | null
  metadata?: Readonly<Record<string, unknown>>
}

export interface PublicTokensRepository {
  /**
   * Create a new public token (hash already computed).
   */
  create(input: CreatePublicTokenInput): Promise<OperatingCorePublicTokenRow>

  /**
   * Find a token by its hash.
   */
  findByHash(tokenHash: string): Promise<OperatingCorePublicTokenRow | null>

  /**
   * Atomically claim a token (single-use semantics).
   * - Returns { ok: true, row } if this caller won the race
   * - Returns { ok: false, reason } if already consumed, not found, or expired
   *
   * Concurrent callers: exactly ONE wins; all others get ok:false.
   */
  claim(tokenHash: string, consumingPersonaId: string | null): Promise<OperatingCoreClaimOutcome>

  /**
   * Delete a token (for cleanup — rows are typically append-only).
   */
  delete(tokenHash: string): Promise<void>
}
