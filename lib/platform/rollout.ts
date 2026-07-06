// Rollout contract: PR gates, staged rollout plan and gate checker.
// Pure module. No DB, no filesystem, no env vars, no `@/lib/supabase/*` imports.

// ── PR Gates ────────────────────────────────────────────────────────
export const PLATFORM_ROLLOUT_PR_GATES = [
  'tests',
  'build',
  'typecheck',
  'bundle_size',
  'review',
] as const

export type PlatformRolloutGateKey = (typeof PLATFORM_ROLLOUT_PR_GATES)[number]

export type PlatformRolloutGate = {
  key: PlatformRolloutGateKey
  description: string
  required: boolean
}

export const PLATFORM_ROLLOUT_GATES: readonly PlatformRolloutGate[] = [
  { key: 'tests', description: 'All focused tests and platform regression pass via pnpm test:ci', required: true },
  { key: 'build', description: 'Production build succeeds via pnpm build', required: true },
  { key: 'typecheck', description: 'TypeScript strict mode passes via npx tsc --noEmit', required: true },
  { key: 'bundle_size', description: 'Bundle size check passes CI gate', required: false },
  { key: 'review', description: 'Fresh 4R review (R1-R4) with no BLOCKER or CRITICAL findings', required: true },
]

// ── Rollout stages ──────────────────────────────────────────────────
export type PlatformRolloutStage = { percentage: number; minHours: number; description: string }

export type PlatformRolloutPlan = {
  stages: readonly PlatformRolloutStage[]
  rollbackPath: { immediate: readonly string[]; description: string }
}

export const PLATFORM_ROLLOUT_PLAN: PlatformRolloutPlan = {
  stages: [
    { percentage: 0, minHours: 0, description: 'Feature flag OFF — legacy code only (current state)' },
    { percentage: 5, minHours: 24, description: '5% traffic — observe error rates and denial thresholds for 24h' },
    { percentage: 25, minHours: 48, description: '25% traffic — observe error rates and denial thresholds for 48h' },
    { percentage: 50, minHours: 72, description: '50% traffic — observe error rates and denial thresholds for 72h' },
    { percentage: 100, minHours: 0, description: '100% traffic — platform navigation fully active; flag becomes permanent' },
  ],
  rollbackPath: {
    immediate: [
      'Set NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH=true in Vercel dashboard + redeploy',
      'OR set NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED=false + redeploy',
    ],
    description: 'At any stage, if error rate or denial rate exceeds the threshold defined in grants.ts checkDenialThreshold(), immediately rollback via kill switch or flag off. The path back to safe legacy state is documented in the incident guide (PR #225 hotfix).',
  },
}

// ── Rollout gate checker (pure function) ────────────────────────────
export type PlatformRolloutGateCheckResult = {
  gateKey: PlatformRolloutGateKey
  passed: boolean
  reason?: string
}

export function checkPlatformRolloutGate(
  gate: PlatformRolloutGate,
  isSatisfied: boolean,
): PlatformRolloutGateCheckResult {
  const passed = isSatisfied || !gate.required

  return {
    gateKey: gate.key,
    passed,
    reason: passed ? undefined : `${gate.key} gate is required for rollout: ${gate.description}`,
  }
}
