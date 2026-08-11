/**
 * PR1 — DT-002 — Talleres module public API.
 * Sibling to lib/platform/pastoral/index.ts pattern.
 *
 * PR9 — DT-034/035 — Adds the events catalog and the participation
 * ledger writer to the public surface.
 */

// Types
export * from './types'

// Errors
export * from './errors'

// Capabilities
export * from './capabilities'

// Flags
export * from './flags'

// Route access
export * from './route-access'

// Participation kinds
export * from './participation-kinds'

// Events (PR9 DT-034)
export * from './events'

// Participation ledger writer (PR9 DT-035)
export * from './participation-ledger-talleres-writer'
