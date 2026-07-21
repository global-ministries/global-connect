/**
 * S19 — Hand-written SQL row types for operating_core_system_notifications.
 *
 * DO NOT regenerate database.types.ts. These types mirror the SQL columns
 * exactly and are the authoritative mapping layer between the database and
 * the domain layer.
 *
 * Columns map as follows (snake_case SQL → camelCase domain convention):
 *   id                → id
 *   persona_id        → personaId
 *   outbox_id         → outboxId
 *   kind              → kind
 *   title             → title
 *   body              → body
 *   target_url        → targetUrl
 *   read_at           → readAt
 *   expires_at        → expiresAt
 *   created_at        → createdAt
 */

export interface OperatingCoreSystemNotificationRow {
  readonly id: string
  readonly persona_id: string
  readonly outbox_id: string | null
  readonly kind: string
  readonly title: string
  readonly body: string
  readonly target_url: string | null
  readonly read_at: string | null
  readonly expires_at: string
  readonly created_at: string
}
