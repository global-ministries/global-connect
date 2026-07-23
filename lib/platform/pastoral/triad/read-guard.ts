/**
 * W07 — DT-035 — Pastoral Triada read guard.
 *
 * Implements access control for triada records and notes.
 *
 * Four circles for triada read:
 * 1. Mentor oficial → full read
 * 2. pastoral.read.all capability → full read
 * 3. Member of triada → full read
 * 4. Otherwise → denied
 *
 * P7 Exception for notes (ESC-07 of pastoral-triada-notes):
 * contexto='simultaneidad' AND actor.rol='coordinador_area'
 * AND note.autor_persona_id != actor.persona_id → deny
 *
 * This means: when a triada is in 'simultaneidad' context,
 * a 'coordinador_area' can only see their own notes, not notes from
 * the GDV leader (lider de GDV).
 *
 * T6: coordinador_area in simultaneidad context cannot see notes
 * from the leader of GDV (the exception above).
 */
import type { PastoralTriada } from '../types'

// ─── Actor type ───────────────────────────────────────────────────────────────

export type PastoralTriadaReadActor = {
  readonly personaId: string
  readonly rolEnTriada?: string // optional role in the triada context
  readonly capabilities: ReadonlyArray<{
    readonly key: string
  }>
}

// ─── Note access result ────────────────────────────────────────────────────────

export type CanReadPastoralTriadaNoteResult =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: 'p7_denied' | 'no_actor' | 'no_note' | 'no_triada' }

// ─── Core read guard ─────────────────────────────────────────────────────────

/**
 * Determines whether an actor can read a pastoral triada note.
 *
 * P7 Exception (ESC-07 of pastoral-triada-notes):
 * When contexto='simultaneidad' AND actor.rol='coordinador_area'
 * AND note.autor_persona_id != actor.persona_id → deny
 *
 * This protects GDV leader notes from being seen by the coordinador_area
 * when the triada was formed in simultaneidad context.
 *
 * @param actor - The actor trying to read the note
 * @param triada - The triada record
 * @param noteAutorPersonaId - The autor_persona_id of the note
 * @returns CanReadPastoralTriadaNoteResult
 */
export function canReadPastoralTriadaNote(
  actor: PastoralTriadaReadActor | null | undefined,
  triada: PastoralTriada | null | undefined,
  noteAutorPersonaId: string | null | undefined,
): CanReadPastoralTriadaNoteResult {
  // No triada → denied
  if (!triada) {
    return { allowed: false, reason: 'no_triada' }
  }

  // No actor or personaId → denied
  if (!actor || !actor.personaId || actor.personaId.trim() === '') {
    return { allowed: false, reason: 'no_actor' }
  }

  // No note autor → denied
  if (!noteAutorPersonaId) {
    return { allowed: false, reason: 'no_note' }
  }

  // P7 Exception: contexto='simultaneidad' AND actor.rol='coordinador_area'
  // AND note.autor_persona_id != actor.persona_id → deny
  if (
    triada.contexto === 'simultaneidad' &&
    actor.rolEnTriada === 'coordinador_area' &&
    noteAutorPersonaId !== actor.personaId
  ) {
    return { allowed: false, reason: 'p7_denied' }
  }

  return { allowed: true }
}

// ─── Filter helpers ──────────────────────────────────────────────────────────

/**
 * Filters notes for an actor in a triada context.
 * Applies P7 exception when contexto='simultaneidad'.
 *
 * @param notes - All notes for the triada
 * @param actor - The actor reading the notes
 * @param triada - The triada record
 * @returns Filtered notes array
 */
export function filterTriadaNotesForActor(
  notes: ReadonlyArray<{ autorPersonaId: string }>,
  actor: PastoralTriadaReadActor,
  triada: PastoralTriada,
): ReadonlyArray<{ autorPersonaId: string }> {
  return notes.filter((note) => {
    const canRead = canReadPastoralTriadaNote(actor, triada, note.autorPersonaId)
    return canRead.allowed
  })
}
