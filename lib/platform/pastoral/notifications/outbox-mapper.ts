/**
 * W11 — DT-063 — Pastoral outbox mapper.
 *
 * Maps pastoral participation events to notification outbox entries.
 *
 * - Reads from the shared ledger (F3) via drain events
 * - Maps to templates `pastoral.*.v1` (email) and `pastoral.*.whatsapp.v1` (WhatsApp)
 * - Crisis alerts (pastoral_crisis_alert) are sent ONLY to pastor/admin, never to assisted
 *
 * This module is a PURE mapper — no side effects, no DB calls.
 */

import type { PastoralParticipationKind } from '../participation-kinds'

// ─── Notification kinds ────────────────────────────────────────────────────────

/**
 * The 13 pastoral notification kinds.
 * Each maps to a template `pastoral.{kind}.email.v1` or `pastoral.{kind}.whatsapp.v1`.
 */
export const PASTORAL_NOTIFICATION_KINDS = [
  'pastoral_one_on_one_scheduled',
  'pastoral_one_on_one_completed',
  'pastoral_one_on_one_cancelled',
  'pastoral_one_on_one_note_logged',
  'pastoral_one_on_one_step_validated',
  'pastoral_one_on_one_reminder',
  'pastoral_triada_formed',
  'pastoral_triada_member_added',
  'pastoral_triada_member_removed',
  'pastoral_triada_disbanded',
  'pastoral_triada_step_suggested',
  'pastoral_triada_step_validated',
  'pastoral_crisis_alert',
] as const

export type PastoralNotificationKind = (typeof PASTORAL_NOTIFICATION_KINDS)[number]

// ─── Recipient types ──────────────────────────────────────────────────────────

export type PastoralRecipientRole = 'mentor' | 'assisted' | 'pastor' | 'admin'

export interface PastoralNotificationRecipient {
  readonly personaId: string
  readonly role: PastoralRecipientRole
}

// ─── Payload ──────────────────────────────────────────────────────────────────

/**
 * Shared payload fields for pastoral notifications.
 * Specific template props extend this with template-specific fields.
 */
export interface PastoralNotificationPayload {
  readonly oneOnOneId?: string
  readonly triadaId?: string
  readonly leaderName: string
  readonly assistedName: string
  readonly eventDate: string
  readonly stepName?: string
  readonly motivo?: string
  readonly [key: string]: unknown
}

// ─── Outbox entry ─────────────────────────────────────────────────────────────

export type PastoralTargetKind = 'email' | 'whatsapp'

export interface PastoralOutboxEntry {
  readonly id: string
  readonly kind: PastoralNotificationKind
  readonly subjectId: string | null
  readonly templateKey: string
  readonly targetKind: PastoralTargetKind
  readonly targetAddress: string // Email or WhatsApp number — populated by caller
  readonly payload: PastoralNotificationPayload
  readonly availableAt: string
  readonly recipientPersonaId: string
}

// ─── Crisis alert helper ───────────────────────────────────────────────────────

const CRISIS_KIND: PastoralNotificationKind = 'pastoral_crisis_alert'

function isCrisisAlert(kind: PastoralNotificationKind): boolean {
  return kind === CRISIS_KIND
}

function isPastorOrAdmin(role: PastoralRecipientRole): boolean {
  return role === 'pastor' || role === 'admin'
}

// ─── Template key derivation ──────────────────────────────────────────────────

function deriveTemplateKey(kind: PastoralNotificationKind, targetKind: PastoralTargetKind): string {
  // kind: pastoral_one_on_one_scheduled → pastoral.one_on_one_scheduled.email.v1
  const base = kind.replace(/^pastoral_/, 'pastoral.')
  return `${base}.${targetKind}.v1`
}

// ─── Main mapper function ─────────────────────────────────────────────────────

/**
 * Maps a pastoral event kind + recipients + payload to a list of outbox entries.
 *
 * Rules:
 * - Non-crisis: both email + WhatsApp for ALL recipients
 * - Crisis alert: ONLY pastor/admin recipients get notified (not assisted)
 *
 * @param kind - the pastoral notification kind
 * @param recipients - list of recipients with their roles
 * @param payload - notification payload data
 * @returns array of outbox entries ready to be inserted into the shared outbox
 */
export function mapPastoralEventToOutboxEntries(
  kind: PastoralNotificationKind,
  recipients: readonly PastoralNotificationRecipient[],
  payload: PastoralNotificationPayload,
): PastoralOutboxEntry[] {
  // Validate kind at runtime
  if (!PASTORAL_NOTIFICATION_KINDS.includes(kind)) {
    throw new Error(`Unknown pastoral notification kind: ${kind}`)
  }

  // Determine which recipients to notify
  const notifiedRecipients = isCrisisAlert(kind)
    ? recipients.filter((r) => isPastorOrAdmin(r.role))
    : recipients

  // Empty recipients → empty entries
  if (notifiedRecipients.length === 0) {
    return []
  }

  const now = new Date().toISOString()
  const subjectId = payload.oneOnOneId ?? payload.triadaId ?? null

  const entries: PastoralOutboxEntry[] = []

  for (const recipient of notifiedRecipients) {
    for (const targetKind of (['email', 'whatsapp'] as const)) {
      entries.push({
        id: `pastoral-${kind}-${recipient.personaId}-${targetKind}-${Date.now()}`,
        kind,
        subjectId,
        templateKey: deriveTemplateKey(kind, targetKind),
        targetKind,
        targetAddress: '', // Filled by caller with actual email/phone
        payload,
        availableAt: now,
        recipientPersonaId: recipient.personaId,
      })
    }
  }

  return Object.freeze(entries)
}
