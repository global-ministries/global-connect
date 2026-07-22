/**
 * W04 — DT-022 — Pastoral participation ledger writer.
 *
 * Wraps OperatingCoreParticipationLedgerRepository (F3) to emit pastoral_* events
 * to the shared ledger `operating_core_participation_eventos`.
 *
 * - All pastoral kinds use `sensitivity='internal'` by default.
 * - `pastoral_crisis_detected` uses `sensitivity='sensitive'` (D15, D28).
 * - `actor_persona_id` and `metadata` are bounded — no PII keys allowed.
 * - Does NOT edit `lib/platform/operating-core/participation-kinds.ts` (byte-identity I-10).
 *
 * Follows the pattern of DreamTeamParticipationEvent writer (F2) and
 * OperatingCoreParticipationLedgerRepository (F3).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AppendParticipationEventInput,
  ParticipationLedgerEvent,
  ParticipationLedgerRepository,
} from '../operating-core/participation-ledger-repository'
import type { PastoralParticipationKind } from './participation-kinds'

export { PASTORAL_PARTICIPATION_KINDS } from './participation-kinds'
export type { PastoralParticipationKind } from './participation-kinds'

// ─── Sensitivity helpers ──────────────────────────────────────────────────────

/** Kinds that carry sensitive content and must use sensitivity='sensitive'. */
const SENSITIVE_KINDS = new Set(['pastoral_crisis_detected'] as const)

/**
 * Returns the appropriate sensitivity value for a pastoral kind.
 * Default: 'internal'. Crisis-detected events: 'sensitive'.
 */
export function pastoralKindSensitivity(kind: PastoralParticipationKind): 'internal' | 'sensitive' {
  return SENSITIVE_KINDS.has(kind) ? 'sensitive' : 'internal'
}

// ─── PII key denylist (mirrors the DB CHECK constraint) ──────────────────────

const PII_KEYS = new Set(['cedula', 'telefono', 'email', 'nombre', 'apellido'] as const)

/**
 * Returns true if the metadata object contains any PII key.
 * Used for runtime validation before emitting to the ledger.
 */
export function metadataHasPII(metadata: Record<string, unknown> | undefined): boolean {
  if (!metadata) return false
  return Object.keys(metadata).some((key) => PII_KEYS.has(key as (typeof PII_KEYS)[number]))
}

// ─── Input types ─────────────────────────────────────────────────────────────

/**
 * Input for building a pastoral participation event.
 * All fields are required except occurredAt (defaults to now).
 */
export interface PastoralLedgerEventInput {
  readonly kind: PastoralParticipationKind
  readonly subjectId: string
  readonly actorPersonaId: string
  readonly occurredAt?: string
  readonly captureSource?: string
  readonly eventId?: string | null
  readonly serviceId?: string | null
  readonly eventInstanceId?: string | null
  readonly metadata?: Record<string, unknown>
}

// ─── Pastoral Ledger Writer ───────────────────────────────────────────────────

export interface PastoralLedgerWriter {
  /**
   * Append a new pastoral participation event to the shared ledger.
   * Sets sensitivity='sensitive' for pastoral_crisis_detected, 'internal' otherwise.
   */
  emitPastoralEvent(input: PastoralLedgerEventInput): Promise<ParticipationLedgerEvent>

  /**
   * Convenience: emit with a pre-built PastoralLedgerEventInput.
   */
  emit(input: PastoralLedgerEventInput): Promise<ParticipationLedgerEvent>
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a PastoralLedgerWriter that wraps the given ParticipationLedgerRepository.
 *
 * The repository is typically created via createSupabaseParticipationLedgerRepository.
 * RLS is enforced by the underlying repository (service_role connection).
 */
export function createPastoralLedgerWriter(
  repository: ParticipationLedgerRepository,
): PastoralLedgerWriter {
  function emitPastoralEvent(
    input: PastoralLedgerEventInput,
  ): Promise<ParticipationLedgerEvent> {
    // Validate no PII in metadata
    if (metadataHasPII(input.metadata)) {
      throw new Error(
        'metadata must not contain PII keys: cedula, telefono, email, nombre, apellido',
      )
    }

    const sensitivity = pastoralKindSensitivity(input.kind)

    const ledgerInput: AppendParticipationEventInput = {
      kind: input.kind, // widened to OperatingCoreParticipationKind via type assertion
      subjectId: input.subjectId,
      occurredAt: input.occurredAt,
      actorPersonaId: input.actorPersonaId,
      captureSource: input.captureSource ?? 'manual',
      experience: 'pastoral',
      eventId: input.eventId ?? null,
      serviceId: input.serviceId ?? null,
      eventInstanceId: input.eventInstanceId ?? null,
      metadata: input.metadata ?? {},
    }

    // Cast kind — the underlying table now accepts pastoral_* via M4 extension
    return repository.append(ledgerInput as AppendParticipationEventInput)
  }

  return {
    emitPastoralEvent,
    emit: emitPastoralEvent,
  }
}

// ─── Supabase factory ─────────────────────────────────────────────────────────

// Relaxed client type — mirrors the pattern in participation-ledger-repository-supabase.ts
type AnySupabaseClient = SupabaseClient<any, any>

/**
 * Creates a PastoralLedgerWriter backed by a Supabase client.
 * The client should be a service_role client for ledger writes.
 */
export function createSupabasePastoralLedgerWriter(
  client: AnySupabaseClient,
): PastoralLedgerWriter {
  // Dynamic import to break circular dependency at runtime
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const { createSupabaseParticipationLedgerRepository } = require('../operating-core/participation-ledger-repository-supabase')

  const repository = createSupabaseParticipationLedgerRepository(client)
  return createPastoralLedgerWriter(repository)
}
