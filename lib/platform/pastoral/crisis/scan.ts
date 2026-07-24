/**
 * W09 — DT-054 — Crisis scan re-exports.
 *
 * Main implementation moved to `crisis/service.ts`.
 * This file re-exports the public surface for backwards-compatibility
 * with W06 DT-041 (the complete endpoint that calls scanAndAlertPastoralCrisis).
 */

// Re-export types
export type {
  PastoralCrisisScanInput,
  PastoralCrisisScanResult,
} from './service'

// Note: scanAndAlertPastoralCrisis is no longer exported from here.
// Use createPastoralCrisisService from './service' instead.
// The W06/W08 stub that returned null has been replaced by the real service.
