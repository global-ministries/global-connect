/**
 * W06 — DT-041 / W09 hook — Crisis scan stub.
 *
 * This is a STUB: returns null always. W09 will replace with the real
 * crisis detection implementation.
 *
 * scanAndAlertPastoralCrisis(input):
 *   - Receives resumen, notas, oneOnOneId, actorPersonaId
 *   - Returns PastoralCrisisScanResult | null (null = no crisis detected, or stub)
 *
 * W09 will implement:
 *   1. Keyword matching against PastoralCrisisKeywordCatalog (M6)
 *   2. Idempotent insertion into pastoral_crisis_detection_log (M7)
 *   3. Emission of pastoral_crisis_detected event with sensitivity='sensitive'
 *   4. Outbox entry for pastoral.crisis.alert.v1
 *
 * This stub allows the complete endpoint (DT-041) to be implemented and tested
 * without waiting for W09 crisis infrastructure.
 */

// ─── Result type ───────────────────────────────────────────────────────────────

export interface PastoralCrisisScanResult {
  readonly scannedAt: string
  readonly crisisDetected: boolean
  readonly categories: readonly string[]
  readonly keywordsMatched: readonly string[]
}

// ─── Input type ───────────────────────────────────────────────────────────────

export interface PastoralCrisisScanInput {
  readonly resumen: string | null
  readonly notas: readonly { contenido: string }[]
  readonly oneOnOneId: string
  readonly actorPersonaId: string
}

// ─── Crisis scan stub ─────────────────────────────────────────────────────────

/**
 * Stub implementation — returns null.
 *
 * W09 will replace this with the real detector that:
 * - Normalizes content (unaccent, lowercase)
 * - Matches against PastoralCrisisKeywordCatalog
 * - Returns PastoralCrisisScanResult with matched categories and keywords
 * - Inserts into pastoral_crisis_detection_log (idempotent by PK)
 * - Emits pastoral_crisis_detected to the ledger
 * - Enqueues pastoral.crisis.alert.v1 to the outbox
 */
export async function scanAndAlertPastoralCrisis(
  _input: PastoralCrisisScanInput,
): Promise<PastoralCrisisScanResult | null> {
  // Stub: no crisis detection in W06
  // W09 replaces this body
  return null
}
