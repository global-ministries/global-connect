export type PlatformUnoAUnoDecision = 'baseline' | 'archive' | 'reintroduce'

export type PlatformUnoAUnoPreflightMissing =
  | 'baseline_migration'
  | 'schema_types_match'
  | 'live_tables_expected'
  | 'rls_verification'
  | 'rollback_strategy'

export const PLATFORM_UNO_A_UNO_REQUIRED_STEPS: readonly PlatformUnoAUnoPreflightMissing[] = [
  'baseline_migration',
  'schema_types_match',
  'live_tables_expected',
  'rls_verification',
  'rollback_strategy',
]

export type PlatformUnoAUnoBaselineEvidence = {
  migration_version: string
  rls_verified: string
  rollback_script: string
}

export type PlatformUnoAUnoArchiveEvidence = {
  archive_date: string
  backup_location: string
}

export type PlatformUnoAUnoReintroduceEvidence = {
  feature_issue: string
  rls_verified: string
  rollback_script: string
}

export type PlatformUnoAUnoPreflightResult =
  | { ok: true; decision: 'baseline'; evidence: PlatformUnoAUnoBaselineEvidence }
  | { ok: true; decision: 'archive'; evidence: PlatformUnoAUnoArchiveEvidence }
  | { ok: true; decision: 'reintroduce'; evidence: PlatformUnoAUnoReintroduceEvidence }
  | { ok: false; reason: 'no_formal_decision'; missing: PlatformUnoAUnoPreflightMissing[] }

export type PlatformUnoAUnoRegisteredDecision = Extract<
  PlatformUnoAUnoPreflightResult,
  { ok: true }
>

// Module-level registry (mutable ONLY via explicit registration in a future commit)
let registeredDecision: PlatformUnoAUnoRegisteredDecision | null = null

export function registerPlatformUnoAUnoDecision(
  decision: PlatformUnoAUnoRegisteredDecision,
): void {
  registeredDecision = decision
}

/** Exported for test isolation only; not part of the public API contract */
export function _resetPlatformUnoAUnoPreflight(): void {
  registeredDecision = null
}

export function runPlatformUnoAUnoPreflight(): PlatformUnoAUnoPreflightResult {
  if (registeredDecision) return registeredDecision

  return {
    ok: false,
    reason: 'no_formal_decision',
    missing: [...PLATFORM_UNO_A_UNO_REQUIRED_STEPS],
  }
}
