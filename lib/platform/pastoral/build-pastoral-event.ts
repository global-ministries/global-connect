/**
 * W04 — DT-023 — buildPastoralEvent helper.
 *
 * Pure helper that constructs a PastoralLedgerEventInput for the shared ledger.
 * Default sensitivity='internal'; pastoral_crisis_detected uses sensitivity='sensitive'.
 *
 * Covers REQ-06 of operating-core-pastoral-bridge spec (ESC-01, ESC-05, ESC-06).
 *
 * Does NOT emit to the ledger — returns a serializable input object ready for
 * the PastoralLedgerWriter.
 */

import type { PastoralParticipationKind } from './participation-kinds'
import type { PastoralLedgerEventInput } from './participation-ledger-pastoral-writer'

// ─── Sensitivity helpers ───────────────────────────────────────────────────────

const CRISIS_KIND = 'pastoral_crisis_detected' as const

/**
 * Returns 'sensitive' only for crisis events, 'internal' for everything else.
 * Per D15 and D28.
 */
export function sensitivityForKind(kind: PastoralParticipationKind): 'internal' | 'sensitive' {
  return kind === CRISIS_KIND ? 'sensitive' : 'internal'
}

// ─── Input builders ────────────────────────────────────────────────────────────

export interface BuildOneOnOneEventOptions {
  readonly kind: Extract<PastoralParticipationKind, `pastoral_one_on_one_${string}`>
  readonly actorPersonaId: string
  readonly oneOnOneId: string
  readonly occurredAt?: string
  readonly captureSource?: string
  readonly eventId?: string | null
  readonly metadata?: Record<string, unknown>
}

export interface BuildTriadaEventOptions {
  readonly kind: Extract<PastoralParticipationKind, `pastoral_triada_${string}`>
  readonly actorPersonaId: string
  readonly triadaId: string
  readonly occurredAt?: string
  readonly captureSource?: string
  readonly eventId?: string | null
  readonly metadata?: Record<string, unknown>
}

export interface BuildCrisisEventOptions {
  readonly actorPersonaId: string
  readonly oneOnOneId: string
  readonly occurredAt?: string
  readonly captureSource?: string
  readonly eventId?: string | null
  readonly metadata?: Record<string, unknown>
}

/**
 * Builds a PastoralLedgerEventInput for a 1:1 pastoral event.
 *
 * subjectId = oneOnOneId (the 1:1 record is the subject of the participation event)
 */
export function buildOneOnOnePastoralEvent(options: BuildOneOnOneEventOptions): PastoralLedgerEventInput {
  const { kind, actorPersonaId, oneOnOneId, occurredAt, captureSource, eventId, metadata } = options

  return {
    kind,
    subjectId: oneOnOneId,
    actorPersonaId,
    occurredAt: occurredAt ?? new Date().toISOString(),
    captureSource: captureSource ?? 'manual',
    eventId: eventId ?? null,
    serviceId: null,
    eventInstanceId: null,
    metadata: metadata ?? {},
  }
}

/**
 * Builds a PastoralLedgerEventInput for a triada pastoral event.
 *
 * subjectId = triadaId (the triada record is the subject of the participation event)
 */
export function buildTriadaPastoralEvent(options: BuildTriadaEventOptions): PastoralLedgerEventInput {
  const { kind, actorPersonaId, triadaId, occurredAt, captureSource, eventId, metadata } = options

  return {
    kind,
    subjectId: triadaId,
    actorPersonaId,
    occurredAt: occurredAt ?? new Date().toISOString(),
    captureSource: captureSource ?? 'manual',
    eventId: eventId ?? null,
    serviceId: null,
    eventInstanceId: null,
    metadata: metadata ?? {},
  }
}

/**
 * Builds a PastoralLedgerEventInput for a pastoral_crisis_detected event.
 * Always uses sensitivity='sensitive' (D15, D28).
 *
 * subjectId = oneOnOneId
 */
export function buildPastoralCrisisEvent(options: BuildCrisisEventOptions): PastoralLedgerEventInput {
  const { actorPersonaId, oneOnOneId, occurredAt, captureSource, eventId, metadata } = options

  return {
    kind: 'pastoral_crisis_detected',
    subjectId: oneOnOneId,
    actorPersonaId,
    occurredAt: occurredAt ?? new Date().toISOString(),
    captureSource: captureSource ?? 'system',
    eventId: eventId ?? null,
    serviceId: null,
    eventInstanceId: null,
    metadata: metadata ?? {},
  }
}

/**
 * Unified builder: builds a PastoralLedgerEventInput for any pastoral kind.
 * Infers subjectId meaning from kind prefix.
 *
 * - pastoral_one_on_one_* → subjectId = oneOnOneId
 * - pastoral_triada_*     → subjectId = triadaId
 * - pastoral_crisis_detected → subjectId = oneOnOneId (linked to the 1:1 where crisis was detected)
 */
export function buildPastoralEvent(
  kind: PastoralParticipationKind,
  actorPersonaId: string,
  subjectId: string,
  metadata?: Record<string, unknown>,
  occurredAt?: string,
  captureSource?: string,
  eventId?: string | null,
): PastoralLedgerEventInput {
  if (kind === 'pastoral_crisis_detected') {
    return buildPastoralCrisisEvent({
      actorPersonaId,
      oneOnOneId: subjectId,
      occurredAt,
      captureSource: captureSource ?? 'system',
      eventId: eventId ?? null,
      metadata,
    })
  }

  if (kind.startsWith('pastoral_triada_')) {
    return buildTriadaPastoralEvent({
      kind: kind as Extract<PastoralParticipationKind, `pastoral_triada_${string}`>,
      actorPersonaId,
      triadaId: subjectId,
      occurredAt,
      captureSource: captureSource ?? 'manual',
      eventId: eventId ?? null,
      metadata,
    })
  }

  // pastoral_one_on_one_* and any other pastoral_* kinds
  return buildOneOnOnePastoralEvent({
    kind: kind as Extract<PastoralParticipationKind, `pastoral_one_on_one_${string}`>,
    actorPersonaId,
    oneOnOneId: subjectId,
    occurredAt,
    captureSource: captureSource ?? 'manual',
    eventId: eventId ?? null,
    metadata,
  })
}
