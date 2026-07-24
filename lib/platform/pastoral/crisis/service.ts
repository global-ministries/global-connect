/**
 * W09 — DT-054 — Pastoral crisis scan + alert service.
 *
 * Replaces the W06/W08 stub in `crisis/scan.ts`.
 *
 * Responsibilities:
 *   1. Run detectCrisisInText over resumen + notas concatenated
 *   2. If detected: write to pastoral_crisis_detection_log (idempotent by PK)
 *   3. If detected: emit pastoral_crisis_detected to the shared ledger (W04 writer)
 *      with sensitivity='sensitive'
 *   4. If detected: enqueue pastoral.crisis.alert.v1 to the shared outbox
 *      (operating_core_notification_outbox via direct INSERT)
 *
 * Idempotency: The detection log PK is
 *   (one_on_one_id, categoria, detected_at_minute)
 * where detected_at_minute = date_trunc('minute', now()).
 * Re-scanning the same 1:1 in the same minute is a no-op.
 *
 * Imports:
 *   - detectCrisisInText (pure detector — DT-053)
 *   - PastoralLedgerWriter from participation-ledger-pastoral-writer (W04)
 *   - Supabase service_role client for direct INSERTs
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PastoralLedgerWriter } from '../participation-ledger-pastoral-writer'
import { detectCrisisInText } from './detector'
import type { CrisisCategoryId } from './keyword-catalog'

// ─── Input / Output types ───────────────────────────────────────────────────────

export interface PastoralCrisisScanInput {
  readonly resumen: string | null
  readonly notas: readonly { contenido: string }[]
  readonly oneOnOneId: string
  readonly actorPersonaId: string
}

export interface PastoralCrisisScanResult {
  readonly scannedAt: string
  readonly crisisDetected: boolean
  readonly categories: readonly string[]
  readonly keywordsMatched: readonly string[]
}

// ─── Service ─────────────────────────────────────────────────────────────────

export interface PastoralCrisisServiceDeps {
  /** Supabase service_role client for direct INSERTs to outbox and detection_log */
  supabase: SupabaseClient<any, any>
  /** Pastoral ledger writer (W04) for emitting pastoral_crisis_detected */
  ledgerWriter: PastoralLedgerWriter
}

/**
 * Creates the pastoral crisis scan-and-alert service.
 *
 * The returned `scanAndAlertPastoralCrisis` is idempotent per the detection log PK.
 */
export function createPastoralCrisisService(deps: PastoralCrisisServiceDeps) {
  const { supabase, ledgerWriter } = deps

  /**
   * Main entry point. Scans resumen + notas for crisis keywords, then:
   *   1. Writes to detection log (idempotent)
   *   2. Emits to ledger (sensitivity='sensitive')
   *   3. Enqueues outbox alert (pastoral.crisis.alert.v1)
   *
   * Returns null if no crisis detected (no side effects).
   */
  async function scanAndAlertPastoralCrisis(
    input: PastoralCrisisScanInput,
  ): Promise<PastoralCrisisScanResult | null> {
    const { resumen, notas, oneOnOneId, actorPersonaId } = input

    // Concatenate resumen + all note contents for scanning
    const textos = [
      resumen ?? '',
      ...notas.map((n) => n.contenido),
    ].join(' ')

    const match = detectCrisisInText(textos)

    if (!match) {
      return null
    }

    const { categoria, matches } = match
    const scannedAt = new Date().toISOString()
    const detectedAtMinute = truncateToMinute(scannedAt)

    // ── Step 1: Detection log (idempotent by composite PK) ───────────────
    // The composite PK (one_on_one_id, categoria, detected_at_minute) ensures
    // that re-scanning the same 1:1 in the same minute is a no-op.
    const { error: logError } = await supabase
      .from('pastoral_crisis_detection_log')
      .insert({
        one_on_one_id: oneOnOneId,
        categoria,
        keyword: matches[0] ?? '',
        actor_persona_id: actorPersonaId,
        detected_at: scannedAt,
        detected_at_minute: detectedAtMinute,
        scan_resumen: resumen !== null && matchesSomeKeyword(resumen, matches),
        scan_nota_id: null,
      } satisfies PastoralCrisisDetectionLogInsert)

    // Idempotent: if PK already exists, INSERT fails with 23505 (not an error)
    if (logError && !isDuplicateKeyError(logError)) {
      throw new Error(
        `pastoral_crisis_detection_log insert failed: ${logError.message}`,
      )
    }

    // ── Step 2: Emit to ledger with sensitivity='sensitive' ──────────────
    await ledgerWriter.emitPastoralEvent({
      kind: 'pastoral_crisis_detected',
      subjectId: oneOnOneId,
      actorPersonaId,
      occurredAt: scannedAt,
      captureSource: 'pastoral_crisis_scan',
      metadata: {
        categoria,
        matchedKeywords: matches,
        scanSource: 'pastoral_crisis_scan',
      },
    })

    // ── Step 3: Enqueue outbox alert ─────────────────────────────────────
    await enqueueCrisisAlert({
      supabase,
      oneOnOneId,
      actorPersonaId,
      categoria,
      matchedKeywords: matches,
      scannedAt,
    })

    return Object.freeze({
      scannedAt,
      crisisDetected: true,
      categories: Object.freeze([categoria]),
      keywordsMatched: Object.freeze([...matches]),
    })
  }

  return { scanAndAlertPastoralCrisis }
}

// ─── Outbox enqueue ────────────────────────────────────────────────────────────

interface OutboxAlertPayload {
  supabase: SupabaseClient<any, any>
  oneOnOneId: string
  actorPersonaId: string
  categoria: CrisisCategoryId
  matchedKeywords: readonly string[]
  scannedAt: string
}

/**
 * Enqueues a pastoral.crisis.alert.v1 notification to the shared outbox.
 *
 * Uses direct INSERT to operating_core_notification_outbox (service_role required).
 * The payload contains template_key so the drain (W11) can route to the right template.
 */
async function enqueueCrisisAlert(payload: OutboxAlertPayload): Promise<void> {
  const { supabase, oneOnOneId, actorPersonaId, categoria, matchedKeywords, scannedAt } = payload

  // Insert into the shared operating_core_notification_outbox table.
  // The kind is 'notification' (F3 enum) and payload.template_key routes to
  // the correct pastoral.crisis.alert.v1 template in W11's outbox mapper.
  const { error: outboxError } = await supabase
    .from('operating_core_notification_outbox')
    .insert({
      kind: 'notification',
      subject_id: oneOnOneId,
      payload: {
        template_key: 'pastoral.crisis.alert.v1',
        one_on_one_id: oneOnOneId,
        actor_persona_id: actorPersonaId,
        categoria,
        matched_keywords: matchedKeywords,
        scanned_at: scannedAt,
      } satisfies PastoralCrisisAlertPayload,
      target_kind: 'email',
      target_address: 'pending-recipient-lookup',
      available_at: new Date().toISOString(),
      max_attempts: 5,
    } satisfies OperatingCoreNotificationOutboxRowInsert)

  if (outboxError) {
    // Non-fatal: log but don't fail the scan if outbox insert fails.
    // The detection was recorded in the ledger + detection log.
    console.error(
      `[pastoral-crisis] outbox enqueue failed: ${outboxError.message}. ` +
      `Crisis detected but alert not enqueued. one_on_one_id=${oneOnOneId}`,
    )
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncateToMinute(isoTimestamp: string): string {
  const d = new Date(isoTimestamp)
  d.setSeconds(0, 0)
  return d.toISOString()
}

function matchesSomeKeyword(
  text: string,
  keywords: readonly string[],
): boolean {
  const lower = text.toLowerCase()
  return keywords.some((kw) => lower.includes(kw.toLowerCase()))
}

function isDuplicateKeyError(error: { code?: string }): boolean {
  // PostgreSQL unique violation — expected for idempotent PK re-insert
  return error.code === '23505'
}

// ─── SQL row types ─────────────────────────────────────────────────────────────

interface PastoralCrisisDetectionLogInsert {
  one_on_one_id: string
  categoria: string
  keyword: string
  actor_persona_id: string
  detected_at: string
  detected_at_minute: string
  scan_resumen: boolean
  scan_nota_id: string | null
}

interface PastoralCrisisAlertPayload {
  template_key: string
  one_on_one_id: string
  actor_persona_id: string
  categoria: CrisisCategoryId
  matched_keywords: readonly string[]
  scanned_at: string
}

interface OperatingCoreNotificationOutboxRowInsert {
  kind: string
  subject_id: string | null
  payload: PastoralCrisisAlertPayload
  target_kind: string
  target_address: string
  available_at: string
  max_attempts: number
}
