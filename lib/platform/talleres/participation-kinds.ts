/**
 * PR1 — DT-003 — Talleres participation kinds.
 * 5 kinds with prefix taller_ (sibling to pastoral kinds).
 *
 * These are sibling kinds alongside pastoral_*, not replacements.
 * Byte-identity of lib/platform/operating-core/kinds.ts is verified in
 * __tests__/lib/platform/talleres/participation-kinds.test.ts.
 */

/**
 * The 5 canonical Talleres participation kinds as specified in design.md §3.
 * These are sibling kinds alongside pastoral_*, not replacements.
 */
export const TALLERES_PARTICIPATION_KINDS = [
  'taller_cohort_started',
  'taller_session_attended',
  'taller_session_missed',
  'taller_completion_recorded',
  'taller_completion_failed',
] as const

export type TalleresParticipationKind = (typeof TALLERES_PARTICIPATION_KINDS)[number]
