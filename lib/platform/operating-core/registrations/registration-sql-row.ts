/**
 * SQL schema mirror for `operating_core_registrations`.
 *
 * Hand-written (NOT regenerated into database.types.ts per program rules).
 * Source: supabase/migrations/<ts>_operating_core_registrations.sql
 *
 * !!! IF database.types.ts IS regenerated in the future, this file must be
 * kept in sync via a follow-up migration, OR types should be migrated to
 * the generated source. Document this dependency.
 */

export type OperatingCoreRegistrationEstadoSql =
  | 'pendiente'
  | 'confirmada'
  | 'asistida'
  | 'no_asistio'
  | 'cancelada'
  | 'rechazada'

export type OperatingCoreRegistrationConfirmationModeSql =
  | 'automatic'
  | 'manual'

export interface OperatingCoreRegistrationRow {
  id: string
  persona_id: string
  event_id: string
  estado: OperatingCoreRegistrationEstadoSql
  confirmation_mode: OperatingCoreRegistrationConfirmationModeSql
  waitlist_position: number | null
  captured_by_persona_id: string | null
  reason: string | null
  created_at: string // ISO timestamp
  updated_at: string // ISO timestamp
  version: number
}

/**
 * Map from SQL column types to TS domain types (mirror S09's Registration).
 * Note: created_at maps to capturedAt per S09's Registration interface.
 */
export interface OperatingCoreRegistrationDomainMapped {
  id: string
  personaId: string
  eventId: string
  state: import('../state').RegistrationState
  confirmationMode: 'automatic' | 'manual'
  waitlistPosition: number | null
  capturedByPersonaId: string | null
  reason: string | null
  createdAt: string
  updatedAt: string
  version: number
}

export function mapSqlRowToDomain(row: OperatingCoreRegistrationRow): OperatingCoreRegistrationDomainMapped {
  return {
    id: row.id,
    personaId: row.persona_id,
    eventId: row.event_id,
    state: row.estado,
    confirmationMode: row.confirmation_mode,
    waitlistPosition: row.waitlist_position,
    capturedByPersonaId: row.captured_by_persona_id,
    reason: row.reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  }
}
