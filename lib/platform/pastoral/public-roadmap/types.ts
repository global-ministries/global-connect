/**
 * W13 — Types for the public roadmap (P6).
 *
 * Field-projection: notes are NEVER included in the public roadmap.
 * Only aggregated 1:1 status, steps validated, and next steps.
 */

// ─── Roadmap item ─────────────────────────────────────────────────────────────

/**
 * A single 1:1 session in the public roadmap.
 * Visible to: assisted person, mentor author, director, pastor/admin.
 */
export interface PublicRoadmapOneOnOne {
  readonly id: string
  readonly estado: string
  readonly scheduledAtIso: string | null
  readonly completedAtIso: string | null
  /** Steps validated in this 1:1 session (P4) */
  readonly pasosValidados: ReadonlyArray<PublicRoadmapStep>
  readonly resumen: null // NEVER exposed in public roadmap
  readonly notas: null   // NEVER exposed in public roadmap
}

/**
 * A validated spiritual step in a public roadmap.
 * Marriage milestone steps are shared; individual steps are private (P9).
 */
export interface PublicRoadmapStep {
  readonly id: string
  readonly stepKey: string
  readonly validatedAtIso: string
  /** Whether this step is a shared milestone (visible to assisted) */
  readonly isSharedMilestone: boolean
}

// ─── Aggregated roadmap ───────────────────────────────────────────────────────

/**
 * Full public roadmap for an assisted person.
 * Aggregates all 1:1 sessions where the person is a participant.
 */
export interface PublicRoadmap {
  readonly assistedPersonaId: string
  /** 1:1 sessions ordered by scheduledAt descending */
  readonly sesiones: ReadonlyArray<PublicRoadmapOneOnOne>
  /** Upcoming session (nearest scheduled, non-terminal) */
  readonly proximoUnoAuno: PublicRoadmapOneOnOne | null
  /** All unique validated steps across sessions */
  readonly pasosValidadosTotal: ReadonlyArray<PublicRoadmapStep>
  /** Suggested next step (declarative rules, D26) */
  readonly proximoPasoSugerido: string | null
  /** Last updated ISO */
  readonly generatedAtIso: string
}

// ─── Next step suggestion rules (D26) ────────────────────────────────────────

/**
 * Declarative rule for next step suggestion.
 * Returns a stepKey or null if no suggestion applies.
 */
export type NextStepRule = (roadmap: PublicRoadmap) => string | null

/**
 * Closed set of step keys for declarative suggestions (D26).
 * Evolution via table `pastoral_step_catalog` deferred to future.
 */
export const PASTORAL_STEP_KEYS = [
  'primera_conexion',
  'establecer_proposito',
  'crecimiento_proposito',
  'servicio_inicial',
  'formacion_lider',
  'envio',
  // Marriage milestones (shared)
  'matrimonio_preparacion',
  'matrimonio_compromiso',
  'matrimonio_comunidad',
] as const

export type PastoralStepKey = (typeof PASTORAL_STEP_KEYS)[number]
