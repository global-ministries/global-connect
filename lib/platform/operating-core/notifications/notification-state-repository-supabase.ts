/**
 * S19 — Supabase adapter for NotificationStateRepository (5th OC Supabase adapter).
 *
 * Maps domain calls to .from(...).update(...).select() operations:
 *   - markSent       → UPDATE operating_core_notification_outbox SET sent_at = $1
 *   - setNextRetry   → UPDATE operating_core_notification_outbox SET next_retry_at = $1
 *   - markTerminal   → UPDATE operating_core_notification_outbox SET status = 'failed', next_retry_at = NULL
 *   - getOutboxEntry → SELECT status, attempt_count, sent_at, next_retry_at
 *   - createSystemNotification → INSERT INTO operating_core_system_notifications
 *   - listUnreadForPersona → SELECT FROM operating_core_system_notifications WHERE read_at IS NULL
 *   - markRead → UPDATE operating_core_system_notifications SET read_at = $1
 *
 * Pattern mirrors other OC Supabase adapters (S09, S12, S15, S17).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import type { NotificationStateRepository, SystemNotificationSummary } from './notification-state-repository'

export interface NotificationStateRepositorySupabaseOptions {
  supabase: SupabaseClient
}

/**
 * Creates a Supabase-backed NotificationStateRepository.
 */
export function createSupabaseNotificationStateRepository(
  options: NotificationStateRepositorySupabaseOptions,
): NotificationStateRepository {
  const { supabase } = options

  return {
    async markSent(outboxId: string, sentAt: string): Promise<void> {
      const { error } = await supabase
        .from('operating_core_notification_outbox')
        .update({ sent_at: sentAt })
        .eq('id', outboxId)

      if (error) {
        throw new Error(`markSent failed: ${error.message}`)
      }
    },

    async setNextRetry(outboxId: string, nextRetryAt: string): Promise<void> {
      const { error } = await supabase
        .from('operating_core_notification_outbox')
        .update({ next_retry_at: nextRetryAt })
        .eq('id', outboxId)

      if (error) {
        throw new Error(`setNextRetry failed: ${error.message}`)
      }
    },

    async markTerminal(outboxId: string): Promise<void> {
      const { error } = await supabase
        .from('operating_core_notification_outbox')
        .update({ status: 'failed', next_retry_at: null })
        .eq('id', outboxId)

      if (error) {
        throw new Error(`markTerminal failed: ${error.message}`)
      }
    },

    async getOutboxEntry(id: string) {
      const { data, error } = await supabase
        .from('operating_core_notification_outbox')
        .select('status, attempt_count, sent_at, next_retry_at')
        .eq('id', id)
        .maybeSingle()

      if (error) {
        throw new Error(`getOutboxEntry failed: ${error.message}`)
      }

      if (!data) return null

      return {
        status: data['status'] as 'pending' | 'processing' | 'dispatched' | 'failed',
        attemptCount: data['attempt_count'] as number,
        sentAt: (data['sent_at'] as string | null) ?? null,
        nextRetryAt: (data['next_retry_at'] as string | null) ?? null,
      }
    },

    async createSystemNotification(input: {
      personaId: string
      outboxId: string | null
      kind: string
      title: string
      body: string
      targetUrl?: string
      expiresAt: string
    }): Promise<{ id: string }> {
      const { data, error } = await supabase
        .from('operating_core_system_notifications')
        .insert({
          persona_id: input.personaId,
          outbox_id: input.outboxId,
          kind: input.kind,
          title: input.title,
          body: input.body,
          target_url: input.targetUrl ?? null,
          expires_at: input.expiresAt,
        })
        .select('id')
        .single()

      if (error) {
        throw new Error(`createSystemNotification failed: ${error.message}`)
      }

      return { id: data['id'] as string }
    },

    async listUnreadForPersona(
      personaId: string,
      limit: number,
    ): Promise<readonly SystemNotificationSummary[]> {
      const clampedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100)

      const { data, error } = await supabase
        .from('operating_core_system_notifications')
        .select('id, title, body, target_url, created_at')
        .eq('persona_id', personaId)
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(clampedLimit)

      if (error) {
        throw new Error(`listUnreadForPersona failed: ${error.message}`)
      }

      return (data ?? []).map(
        (row): SystemNotificationSummary => ({
          id: row['id'] as string,
          title: row['title'] as string,
          body: row['body'] as string,
          targetUrl: (row['target_url'] as string | null) ?? null,
          createdAt: row['created_at'] as string,
        }),
      )
    },

    async markRead(id: string, readAt: string): Promise<void> {
      const { error } = await supabase
        .from('operating_core_system_notifications')
        .update({ read_at: readAt })
        .eq('id', id)

      if (error) {
        throw new Error(`markRead failed: ${error.message}`)
      }
    },
  }
}
