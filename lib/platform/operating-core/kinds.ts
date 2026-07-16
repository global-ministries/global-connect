/**
 * Operating Core participation kinds.
 * Canonical 11-kind union — one_on_one_logged is EXCLUDED.
 * Mirrors dream-team/types.ts pattern (read-only reference).
 */

export const OPERATING_CORE_PARTICIPATION_KINDS = [
  'attendance',
  'visitor_capture',
  'registration',
  'cancellation',
  'check_in',
  'check_out',
  'attendance_update',
  'service_assignment',
  'requirement_update',
  'transition',
  'document_received',
] as const

export type OperatingCoreParticipationKind =
  (typeof OPERATING_CORE_PARTICIPATION_KINDS)[number]
