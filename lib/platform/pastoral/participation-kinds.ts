/**
 * W01 — DT-002 — Pastoral participation kinds.
 * 14 kinds with prefix pastoral_ (13 from D15 + pastoral_crisis_detected).
 * Lives as sibling to lib/platform/operating-core/kinds.ts (no edits to protected file).
 */

/**
 * The 14 pastoral participation kinds.
 * Written to the shared ledger `operating_core_participation_eventos`
 * with sensitivity='internal' (except pastoral_crisis_detected = 'sensitive').
 */
export const PASTORAL_PARTICIPATION_KINDS = [
  'pastoral_one_on_one_logged',
  'pastoral_one_on_one_completed',
  'pastoral_one_on_one_cancelled',
  'pastoral_one_on_one_note_logged',
  'pastoral_one_on_one_followup_set',
  'pastoral_one_on_one_followup_completed',
  'pastoral_one_on_one_step_validated',
  'pastoral_triada_formed',
  'pastoral_triada_member_added',
  'pastoral_triada_member_removed',
  'pastoral_triada_disbanded',
  'pastoral_triada_step_suggested',
  'pastoral_triada_step_validated',
  'pastoral_crisis_detected',
] as const

export type PastoralParticipationKind = (typeof PASTORAL_PARTICIPATION_KINDS)[number]
