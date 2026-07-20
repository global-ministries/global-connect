/**
 * S11 — PublicTokensRepository Supabase adapter.
 *
 * Mirrors S10 registration-repository-supabase.ts pattern.
 *
 * RLS enforcement: auth.uid() is bound SERVER-SIDE by Postgres RLS policies.
 * No p_auth_id parameter is ever sent by the client.
 *
 * NOTE: operating_core_public_tokens is a future-apply migration (not yet
 * in generated Database types). This adapter uses a relaxed SupabaseClient type
 * to allow compile-time use before the migration is applied. The actual table
 * name is validated at runtime by Postgres.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PublicTokensRepository } from './public-token-repository'
import type {
  CreatePublicTokenInput,
} from './public-token-repository'
import type {
  OperatingCorePublicTokenRow,
  OperatingCoreClaimOutcome,
} from './public-token-sql-row'

// Relaxed client type — operating_core_public_tokens is not yet in generated
// Database types (future-apply migration). Using SupabaseClient without Database generic
// avoids cast-heavy code while maintaining runtime safety via Postgres.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberate type relaxation for future-apply table
type AnySupabaseClient = SupabaseClient<any, any>

export interface PublicTokensRepositorySupabaseOptions {
  supabase: AnySupabaseClient
}

const TABLE = 'operating_core_public_tokens' as const

export function createSupabasePublicTokensRepository(
  options: PublicTokensRepositorySupabaseOptions,
): PublicTokensRepository {
  const { supabase } = options

  async function create(input: CreatePublicTokenInput): Promise<OperatingCorePublicTokenRow> {
    const insertData = {
      token_hash: input.tokenHash,
      resource_type: input.resourceType,
      resource_id: input.resourceId,
      persona_id: input.personaId,
      expires_at: input.expiresAt,
      captured_by_persona_id: input.capturedByPersonaId,
      metadata: input.metadata ?? {},
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from(TABLE)
      .insert(insertData)
      .select()
      .single()

    if (error || !data) {
      throw new Error(error?.message ?? 'Failed to insert public token')
    }
    return data as OperatingCorePublicTokenRow
  }

  async function findByHash(tokenHash: string): Promise<OperatingCorePublicTokenRow | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from(TABLE)
      .select()
      .eq('token_hash', tokenHash)
      .maybeSingle()

    if (error || !data) return null
    return data as OperatingCorePublicTokenRow
  }

  async function claim(
    tokenHash: string,
    consumingPersonaId: string | null,
  ): Promise<OperatingCoreClaimOutcome> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc(
      'operating_core_claim_public_token',
      {
        p_token_hash: tokenHash,
        p_consuming_persona_id: consumingPersonaId,
      },
    )

    if (error) {
      // RPC returned error — treat as not found / consumed
      return { ok: false, reason: 'token_not_found' }
    }

    if (!data) {
      // RPC returned NULL → already consumed, expired, or not found
      return { ok: false, reason: 'token_not_found' }
    }

    return { ok: true, row: data as OperatingCorePublicTokenRow }
  }

  async function deleteToken(tokenHash: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from(TABLE)
      .delete()
      .eq('token_hash', tokenHash)
  }

  return {
    create,
    findByHash,
    claim,
    delete: deleteToken,
  }
}
