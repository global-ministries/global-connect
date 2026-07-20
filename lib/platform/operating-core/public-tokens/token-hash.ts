import { createHash } from 'node:crypto'

/**
 * SHA-256 hash of a public token. NEVER log or store the raw token.
 *
 * The hash is irreversible (one-way). The raw token is provided to the
 * end-user via the registration link; only the hash is persisted.
 */
export function hashPublicToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex')
}
