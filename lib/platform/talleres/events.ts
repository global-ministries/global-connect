/**
 * PR9 — DT-034 — Talleres internal event catalog (versioned, no external
 * channels). Sibling to lib/platform/pastoral/events.ts pattern (future).
 *
 * Each TallerEvent is a structured, versioned record of a single domain
 * event inside the Growth Workshops subsystem. The catalog carries
 * enough context to power downstream replay (workshop identifier,
 * edition, group, person, actor, timestamp, structured metadata) and
 * explicitly excludes sensitive PII fields (cédula, telefono, email,
 * notas_privadas, contact_data).
 *
 * The system SHALL NOT integrate with external delivery channels
 * (email, push, WhatsApp) in this phase. Events are persisted
 * internally and drained to the shared participation ledger by
 * `participation-ledger-talleres-writer.ts`.
 */

/** Current schema version of the TallerEvent contract. Bump on breaking changes. */
export const SCHEMA_VERSION = 'v1'

/**
 * The 5 canonical Talleres participation kinds (sibling to pastoral_*).
 * Mirrors `TALLERES_PARTICIPATION_KINDS` in `participation-kinds.ts` for
 * the 5 kinds that reach the shared ledger. The internal `taller_eventos`
 * table also accepts a wider set — for now only the 5 taller_* kinds
 * are emitted by the writer.
 */
export const TALLER_EVENT_KINDS = [
  'taller_cohort_started',
  'taller_session_attended',
  'taller_session_missed',
  'taller_completion_recorded',
  'taller_completion_failed',
] as const

export type TallerEventKind = (typeof TALLER_EVENT_KINDS)[number]

/** Scope of a TallerEvent (which subsystem entity the event pertains to). */
export type TallerEventScopeType = 'taller' | 'cohorte' | 'grupo'

/** Sensitive field names rejected at the builder boundary. */
export const TALLER_EVENT_SENSITIVE_FIELDS = [
  'cedula',
  'telefono',
  'email',
  'notas_privadas',
  'contact_data',
] as const

export type TallerEventSensitiveField = (typeof TALLER_EVENT_SENSITIVE_FIELDS)[number]

/**
 * Discriminated error for sensitive-data detection at the event boundary.
 * Thrown by `buildTallerEvent` (and re-thrown by the writer as
 * defense in depth) when a forbidden field appears in input metadata.
 */
export class TallerEventSensitiveDataError extends Error {
  readonly code = 'TALLER_EVENT_SENSITIVE_DATA' as const
  readonly detectedFields: readonly string[]
  constructor(detectedFields: readonly string[]) {
    super(
      `TallerEvent metadata contains sensitive field(s): ${detectedFields.join(', ')}. These fields must never be embedded in event payloads.`,
    )
    this.name = 'TallerEventSensitiveDataError'
    this.detectedFields = [...detectedFields]
    Object.setPrototypeOf(this, TallerEventSensitiveDataError.prototype)
  }
}

/** A complete, ready-to-persist TallerEvent. */
export interface TallerEvent {
  readonly kind: TallerEventKind
  readonly tallerId: string
  readonly cohorteId: string | null
  readonly grupoId: string | null
  readonly personaId: string
  readonly actorPersonaId: string
  readonly scopeType: TallerEventScopeType
  readonly scopeId: string | null
  readonly schemaVersion: typeof SCHEMA_VERSION
  readonly payload: Readonly<Record<string, unknown>>
  readonly occurredAt: string // ISO
}

/** Inputs to buildTallerEvent. */
export interface BuildTallerEventInput {
  readonly kind: TallerEventKind
  readonly personaId: string
  readonly actorPersonaId: string
  readonly tallerId: string
  readonly cohorteId?: string
  readonly grupoId?: string
  readonly scopeType: TallerEventScopeType
  readonly scopeId?: string
  readonly payload?: Readonly<Record<string, unknown>>
  readonly occurredAt?: string
}

/**
 * Filter the input payload, returning the safe subset. Internal helper
 * — exposed only for the writer's defense-in-depth re-check.
 */
export function filterSensitivePayload(
  payload: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  if (!payload) return {}
  const safe: Record<string, unknown> = {}
  const forbidden = new Set<string>(TALLER_EVENT_SENSITIVE_FIELDS)
  for (const [key, value] of Object.entries(payload)) {
    if (forbidden.has(key)) continue
    safe[key] = value
  }
  return safe
}

/**
 * Detect whether the payload contains any sensitive fields. Returns
 * the list of detected forbidden keys (empty if the payload is safe).
 */
export function detectSensitiveFields(
  payload: Readonly<Record<string, unknown>> | undefined,
): readonly string[] {
  if (!payload) return []
  const forbidden = new Set<string>(TALLER_EVENT_SENSITIVE_FIELDS)
  const detected: string[] = []
  for (const key of Object.keys(payload)) {
    if (forbidden.has(key)) detected.push(key)
  }
  return detected
}

/**
 * Build a TallerEvent from input, filtering any sensitive fields at
 * the builder boundary. Throws `TallerEventSensitiveDataError` if the
 * caller passes forbidden fields (the filter is silent — the explicit
 * throw is a defense-in-depth signal that the caller is leaking PII).
 *
 * Caller is expected to log/handle the error and NOT persist the event.
 */
export function buildTallerEvent(input: BuildTallerEventInput): TallerEvent {
  const detected = detectSensitiveFields(input.payload)
  if (detected.length > 0) {
    throw new TallerEventSensitiveDataError(detected)
  }

  return {
    kind: input.kind,
    tallerId: input.tallerId,
    cohorteId: input.cohorteId ?? null,
    grupoId: input.grupoId ?? null,
    personaId: input.personaId,
    actorPersonaId: input.actorPersonaId,
    scopeType: input.scopeType,
    scopeId: input.scopeId ?? null,
    schemaVersion: SCHEMA_VERSION,
    payload: filterSensitivePayload(input.payload),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  }
}

/** Type guard for `TallerEventKind`. */
export function isTallerKind(value: string): value is TallerEventKind {
  return (TALLER_EVENT_KINDS as readonly string[]).includes(value)
}
