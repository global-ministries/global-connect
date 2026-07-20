/**
 * SQL schema mirror for `operating_core_public_tokens`.
 *
 * Hand-written (NOT regenerated into database.types.ts per program rules).
 * Source: supabase/migrations/<ts>_operating_core_public_tokens.sql
 */
export interface OperatingCorePublicTokenRow {
  token_hash: string
  resource_type: string
  resource_id: string
  persona_id: string | null
  expires_at: string
  consumed_at: string | null
  consumed_by_persona_id: string | null
  captured_by_persona_id: string | null
  metadata: Readonly<Record<string, unknown>>
  created_at: string
}

/**
 * Outcome of attempting to claim a public token.
 * - ok=true + row  → token was successfully claimed (single-use winner)
 * - ok=false       → token not found, expired, or already consumed
 *                    (all map to 404 at API layer to avoid existence disclosure)
 */
export type OperatingCoreClaimOutcome =
  | { ok: true; row: OperatingCorePublicTokenRow }
  | { ok: false; reason: 'token_not_found' | 'token_expired' }
