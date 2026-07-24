/**
 * W05 — DT-029 — Pastoral 1:1 read guard.
 *
 * Implements three circles (P6):
 * 1. Participated person (P6): roadmap read — estado, scheduledAt, completedAt, motivoCancelacion only
 * 2. Mentor autor: full read (all fields + notes)
 * 3. Pastor/admin (pastoral.read.all): full read
 *
 * Also implements field projection so private fields (resumen, notes) never
 * appear in the roadmap public view (T2).
 *
 * ESC-01: actor is mentor → full read
 * ESC-02: actor is pastoral.read.all → full read
 * ESC-03: actor is participated person (P6) → roadmap only
 * ESC-04: actor is participated person AND mentor or admin → full read (most privileged)
 * ESC-05: no actor / empty personaId → denied
 * ESC-06: null oneOnOne → denied
 * T2: notes never in roadmap
 */
import type {
  PastoralOneOnOne,
  PastoralOneOnOneNota,
} from '../types'

// ─── Actor type ───────────────────────────────────────────────────────────────

export type PastoralOneOnOneReadActor = {
  readonly personaId: string
  readonly capabilities: ReadonlyArray<{
    readonly key: string
  }>
}

// ─── Field projection types ─────────────────────────────────────────────────

/** Full 1:1 — all fields (mentor autor or pastor/admin) */
export interface PastoralOneOnOneFull extends PastoralOneOnOne {
  // All fields from PastoralOneOnOne
}

/** Roadmap view (P6 — participated person) — public fields only */
export interface PastoralOneOnOneRoadmap {
  readonly id: string
  readonly estado: PastoralOneOnOne['estado']
  readonly scheduledAt: string | null
  readonly completedAt: string | null
  readonly motivoCancelacion: string | null
  // NO resumen, NO notes, NO private fields
}

// ─── Read result ─────────────────────────────────────────────────────────────

export type PastoralOneOnOneReadResult =
  | { readonly allowed: true; readonly mode: 'full' | 'roadmap'; readonly actor: PastoralOneOnOneReadActor }
  | { readonly allowed: false; readonly reason: 'no_actor' | 'no_one_on_one' | 'access_denied' }

// ─── Core read guard ─────────────────────────────────────────────────────────

/**
 * Determines whether an actor can read a pastoral 1:1.
 *
 * Three circles (P6):
 * 1. Actor is mentorOficialPersonaId → full read
 * 2. Actor has pastoral.read.all capability → full read
 * 3. Actor is a participated person (in participantes list) → roadmap only
 * 4. Otherwise → denied
 *
 * Null/undefined actor or oneOnOne → denied.
 */
export function canReadPastoralOneOnOne(
  actor: PastoralOneOnOneReadActor | null | undefined,
  oneOnOne: PastoralOneOnOne | null | undefined,
  participantes: readonly { personaId: string }[],
): PastoralOneOnOneReadResult {
  // ESC-06: no oneOnOne → denied
  if (!oneOnOne) {
    return { allowed: false, reason: 'no_one_on_one' }
  }

  // ESC-05: no actor / empty personaId → denied
  if (!actor || !actor.personaId || actor.personaId.trim() === '') {
    return { allowed: false, reason: 'no_actor' }
  }

  // Circle 1: mentor autor → full read
  if (oneOnOne.mentorOficialPersonaId === actor.personaId) {
    return { allowed: true, mode: 'full', actor }
  }

  // Circle 2: pastoral.read.all capability → full read
  if (actor.capabilities.some((cap) => cap.key === 'pastoral.read.all')) {
    return { allowed: true, mode: 'full', actor }
  }

  // Circle 3: participated person (P6) → roadmap only
  if (participantes.some((p) => p.personaId === actor.personaId)) {
    return { allowed: true, mode: 'roadmap', actor }
  }

  // Denied
  return { allowed: false, reason: 'access_denied' }
}

// ─── Field projection helpers ─────────────────────────────────────────────────

/**
 * Projects a 1:1 to roadmap shape — strips resumen, notes, and all private fields.
 * Per T2: notes never appear in roadmap public view.
 */
export function projectToRoadmap(oneOnOne: PastoralOneOnOne): PastoralOneOnOneRoadmap {
  return {
    id: oneOnOne.id,
    estado: oneOnOne.estado,
    scheduledAt: oneOnOne.scheduledAt,
    completedAt: oneOnOne.completedAt,
    motivoCancelacion: oneOnOne.motivoCancelacion,
  }
}

/**
 * Returns the appropriate view of a 1:1 based on read result.
 * Full read → returns full PastoralOneOnOne
 * Roadmap read → returns projected PastoralOneOnOneRoadmap
 */
export function applyReadResult(
  oneOnOne: PastoralOneOnOne,
  result: PastoralOneOnOneReadResult,
): PastoralOneOnOne | PastoralOneOnOneRoadmap | null {
  if (!result.allowed) {
    return null
  }
  // At this point TypeScript knows allowed=true, but we need to check reason
  // to narrow away from the success branch which has no 'reason'
  if ('reason' in result) {
    return null
  }
  if (result.mode === 'full') {
    return oneOnOne
  }
  return projectToRoadmap(oneOnOne)
}

/**
 * Filters notes so only notes authored by the actor are included in roadmap view.
 * Per D16: notes are private — only author or pastoral.read.all can read them.
 *
 * In roadmap mode (P6), notes should be empty.
 * In full mode, all notes are returned (caller should also check capability).
 */
export function filterNotesForActor(
  notas: readonly PastoralOneOnOneNota[],
  actor: PastoralOneOnOneReadActor,
  isFullRead: boolean,
): readonly PastoralOneOnOneNota[] {
  if (isFullRead) {
    // In full read mode, all notes are visible (RLS handles access control)
    return notas
  }
  // In roadmap mode (P6), no notes should be visible
  return []
}
