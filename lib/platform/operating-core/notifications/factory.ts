/**
 * S19 — NotificationStateRepository factory.
 *
 * Selects the appropriate implementation based on environment.
 * In production, always returns the Supabase adapter.
 */

import { createNotificationStateRepositoryFake } from './notification-state-repository-fake'
import { createSupabaseNotificationStateRepository } from './notification-state-repository-supabase'
import type { NotificationStateRepository } from './notification-state-repository'
import type { NotificationStateRepositorySupabaseOptions } from './notification-state-repository-supabase'

export type { NotificationStateRepository, SystemNotificationSummary } from './notification-state-repository'

/**
 * Creates the appropriate NotificationStateRepository implementation.
 *
 * @param options - either a Supabase client (production) or no options (fake)
 */
export function createNotificationStateRepository(
  options?: NotificationStateRepositorySupabaseOptions,
): NotificationStateRepository {
  if (options?.supabase) {
    return createSupabaseNotificationStateRepository(options)
  }
  return createNotificationStateRepositoryFake()
}
