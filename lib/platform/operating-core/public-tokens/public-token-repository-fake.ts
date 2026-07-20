/**
 * S11 — in-memory fake implementation of PublicTokensRepository.
 * For unit tests only. Simulates atomic claim via internal mutex map.
 * Mirrors S09/S10 pattern: registration-repository-fake.ts.
 */
import type { PublicTokensRepository } from './public-token-repository'
import type {
  CreatePublicTokenInput,
} from './public-token-repository'
import type {
  OperatingCorePublicTokenRow,
  OperatingCoreClaimOutcome,
} from './public-token-sql-row'

export interface InMemoryPublicTokensRepositoryOptions {
  readonly seed?: ReadonlyArray<OperatingCorePublicTokenRow>
}

/**
 * Serializes claim operations per token using a promise chain.
 * Each new claim waits for the previous claim's promise to settle before running.
 * This simulates the FOR UPDATE SKIP LOCKED behavior.
 */
type ClaimChain = Map<string, Promise<OperatingCoreClaimOutcome>>

export function createInMemoryPublicTokensRepository(
  options: InMemoryPublicTokensRepositoryOptions = {},
): PublicTokensRepository {
  const tokens: OperatingCorePublicTokenRow[] = options.seed ? [...options.seed] : []
  const chains: ClaimChain = new Map()

  function now(): string {
    return new Date().toISOString()
  }

  function findByHashSync(tokenHash: string): OperatingCorePublicTokenRow | null {
    return tokens.find((t) => t.token_hash === tokenHash) ?? null
  }

  async function claimImpl(tokenHash: string, consumingPersonaId: string | null): Promise<OperatingCoreClaimOutcome> {
    const token = findByHashSync(tokenHash)
    if (!token) {
      return { ok: false, reason: 'token_not_found' }
    }
    if (token.consumed_at !== null) {
      return { ok: false, reason: 'token_not_found' }
    }
    if (new Date(token.expires_at) <= new Date()) {
      return { ok: false, reason: 'token_expired' }
    }

    const index = tokens.findIndex((t) => t.token_hash === tokenHash)
    if (index === -1) {
      return { ok: false, reason: 'token_not_found' }
    }

    const updated: OperatingCorePublicTokenRow = {
      ...tokens[index],
      consumed_at: now(),
      consumed_by_persona_id: consumingPersonaId,
    }
    tokens[index] = updated
    return { ok: true, row: updated }
  }

  return {
    async create(input: CreatePublicTokenInput): Promise<OperatingCorePublicTokenRow> {
      const row: OperatingCorePublicTokenRow = {
        token_hash: input.tokenHash,
        resource_type: input.resourceType,
        resource_id: input.resourceId,
        persona_id: input.personaId,
        expires_at: input.expiresAt,
        consumed_at: null,
        consumed_by_persona_id: null,
        captured_by_persona_id: input.capturedByPersonaId,
        metadata: input.metadata ?? {},
        created_at: now(),
      }
      tokens.push(row)
      return row
    },

    async findByHash(tokenHash: string): Promise<OperatingCorePublicTokenRow | null> {
      return findByHashSync(tokenHash)
    },

    async claim(
      tokenHash: string,
      consumingPersonaId: string | null,
    ): Promise<OperatingCoreClaimOutcome> {
      // Chain this claim onto any in-flight claim for the same token
      const previous = chains.get(tokenHash)

      const thisClaim = (async (): Promise<OperatingCoreClaimOutcome> => {
        // Wait for previous claim to complete first
        if (previous) {
          await previous
        }
        // Now execute this claim
        return claimImpl(tokenHash, consumingPersonaId)
      })()

      chains.set(tokenHash, thisClaim)

      try {
        return await thisClaim
      } finally {
        // Clean up chain when this claim settles
        if (chains.get(tokenHash) === thisClaim) {
          chains.delete(tokenHash)
        }
      }
    },

    async delete(tokenHash: string): Promise<void> {
      const index = tokens.findIndex((t) => t.token_hash === tokenHash)
      if (index !== -1) {
        tokens.splice(index, 1)
      }
    },
  }
}
