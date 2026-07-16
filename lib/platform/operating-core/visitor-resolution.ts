/**
 * Operating Core visitor resolution adapter.
 * Consumes findPlatformPersonaCandidates contract and usuarios.cedula.
 * Reuses persona.ts — no parallel identity contract.
 * No raw cedula in ledger metadata (non-PII discipline).
 */
import { findPlatformPersonaCandidates } from '@/lib/platform/persona'
import type {
  PlatformPersonaLookupActor,
  PlatformPersonaLookup,
  PlatformPersonaLookupResult,
  PlatformPersonaSignalName,
} from '@/lib/platform/persona'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type VisitorCaptureMetadata = {
  readonly matchMethod: 'cedula_exact' | 'persona_candidate' | 'minimal_creation'
  readonly actor?: { readonly personaId: string }
  readonly captureSource: string
  readonly resolvedAt: string
}

export type VisitorResolutionResult =
  | {
      ok: true
      decision: 'resolved'
      match: 'single_candidate'
      personaId: string
      hasAuthAccount: boolean
      matchedSignals: PlatformPersonaSignalName[]
      reviewRequired: false
      metadata: VisitorCaptureMetadata
    }
  | {
      ok: true
      decision: 'resolved'
      match: 'no_match'
      createdPersona: { readonly id: string; readonly autoMerge: false }
      metadata: VisitorCaptureMetadata
    }
  | {
      ok: false
      decision: 'ambiguous_candidates' | 'review_required'
      candidates: ReadonlyArray<{
        readonly personaId: string
        readonly displayName: string
        readonly hasAuthAccount: boolean
        readonly matchedSignals: PlatformPersonaSignalName[]
      }>
      reason: 'requires_operator_confirmation'
      metadata: VisitorCaptureMetadata
    }
  | {
      ok: false
      decision: 'lookup_failed'
      reason: 'lookup_failed' | 'unrecoverable_lookup_error'
    }

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export type ResolveVisitorInput = {
  actor: {
    personaId: string
    allowedFlows: readonly string[]
    allowedScopes?: readonly string[]
  }
  personaLookup: PlatformPersonaLookup
}

export type ResolveVisitorQuery = {
  readonly cedula?: string | null
  readonly email?: string | null
  readonly telefono?: string | null
  readonly nombre?: string | null
  readonly apellido?: string | null
  readonly fechaNacimiento?: string | null
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

const OPERATING_CORE_CAPTURE_FLOW = 'operating_core.capture'
const OPERATING_CORE_REQUIRED_SCOPE = 'experience:operating_core'

function buildActor(actor: ResolveVisitorInput['actor']): PlatformPersonaLookupActor {
  return {
    personaId: actor.personaId,
    allowedFlows: [...actor.allowedFlows],
    allowedScopes: actor.allowedScopes ? [...actor.allowedScopes] : [],
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

function buildMetadata(
  matchMethod: VisitorCaptureMetadata['matchMethod'],
  actor: ResolveVisitorInput['actor'],
  captureSource: string,
): VisitorCaptureMetadata {
  return Object.freeze({
    matchMethod,
    actor: Object.freeze({ personaId: actor.personaId }),
    captureSource,
    resolvedAt: nowIso(),
  })
}

function personaCandidateToCandidate(c: {
  personaId: string
  displayName: string
  hasAuthAccount: boolean
  matchedSignals: PlatformPersonaSignalName[]
}) {
  return Object.freeze({
    personaId: c.personaId,
    displayName: c.displayName,
    hasAuthAccount: c.hasAuthAccount,
    matchedSignals: [...c.matchedSignals],
  })
}

/**
 * Resolve a visitor by cedula (or other signals) using the platform persona contract.
 *
 * Outcomes:
 * - single_candidate → resolved (reuse existing persona)
 * - ambiguous_candidates → operator confirmation required
 * - no_match → minimum persona with autoMerge=false (stub until S11 DB adapter)
 * - lookup_failed → unrecoverable error
 *
 * Metadata is NON-PII — no raw cedula/telefono/email/nombre/apellido.
 */
export async function resolveVisitor(
  input: ResolveVisitorInput,
  query: ResolveVisitorQuery,
): Promise<VisitorResolutionResult> {
  const personaInput = {
    actor: buildActor(input.actor),
    flow: OPERATING_CORE_CAPTURE_FLOW,
    requiredScope: OPERATING_CORE_REQUIRED_SCOPE,
    query: {
      cedula: query.cedula,
      email: query.email,
      telefono: query.telefono,
      nombre: query.nombre,
      apellido: query.apellido,
      fechaNacimiento: query.fechaNacimiento,
    },
    personaLookup: input.personaLookup,
  }

  let lookupResult: PlatformPersonaLookupResult
  try {
    lookupResult = await findPlatformPersonaCandidates(personaInput)
  } catch {
    return {
      ok: false,
      decision: 'lookup_failed',
      reason: 'unrecoverable_lookup_error',
    }
  }

  // Map PlatformPersonaLookupResult → VisitorResolutionResult
  if (!lookupResult.ok) {
    // Denied / error case
    return {
      ok: false,
      decision: 'lookup_failed',
      reason: 'lookup_failed',
    }
  }

  const { decision, reviewRequired, candidates } = lookupResult

  // Determine matchMethod based on which signals were matched
  const matchedSignals = candidates.flatMap((c) => [...c.matchedSignals])
  const hasCedula = matchedSignals.includes('cedula')
  const matchMethod: VisitorCaptureMetadata['matchMethod'] = hasCedula ? 'cedula_exact' : 'persona_candidate'

  // Single candidate, no review required → resolved
  if (decision === 'single_candidate' && !reviewRequired) {
    const candidate = candidates[0]
    const metadata = buildMetadata(matchMethod, input.actor, 'form')
    return Object.freeze({
      ok: true,
      decision: 'resolved',
      match: 'single_candidate',
      personaId: candidate.personaId,
      hasAuthAccount: candidate.hasAuthAccount,
      matchedSignals: [...candidate.matchedSignals],
      reviewRequired: false as const,
      metadata,
    })
  }

  // Single candidate with review required OR ambiguous → operator confirmation
  if (
    (decision === 'single_candidate' && reviewRequired) ||
    decision === 'ambiguous_candidates'
  ) {
    const metadata = buildMetadata(matchMethod, input.actor, 'form')
    return Object.freeze({
      ok: false,
      decision: decision === 'ambiguous_candidates' ? 'ambiguous_candidates' : 'review_required',
      candidates: candidates.map(personaCandidateToCandidate),
      reason: 'requires_operator_confirmation',
      metadata,
    })
  }

  // no_match — create minimum persona with autoMerge=false
  if (decision === 'no_match') {
    const metadata = buildMetadata('minimal_creation', input.actor, 'form')
    // Stub ID until S11 Supabase adapter provides real generation
    const stubId = `generated-at-capture-${Date.now()}`
    return Object.freeze({
      ok: true,
      decision: 'resolved',
      match: 'no_match',
      createdPersona: Object.freeze({ id: stubId, autoMerge: false as const }),
      metadata,
    })
  }

  // Fallback unrecoverable
  return {
    ok: false,
    decision: 'lookup_failed',
    reason: 'lookup_failed',
  }
}
