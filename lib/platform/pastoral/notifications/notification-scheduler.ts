/**
 * W11 — DT-066/DT-067 — Notification scheduler for pastoral 1:1 reminders.
 *
 * Scans pastoral_one_on_one table for 1:1s with scheduled_at in the next 24h
 * and emits pastoral_one_on_one_reminder events to the outbox for both
 * mentor and assisted.
 *
 * MVP implementation: in-memory worker using setInterval.
 * Push notifications are out of scope (documented as follow-up).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { mapPastoralEventToOutboxEntries } from './outbox-mapper'
import type { PastoralNotificationPayload } from './outbox-mapper'
import { PASTORAL_NOTIFICATION_KINDS } from './outbox-mapper'

// ─── Constants ────────────────────────────────────────────────────────────────

const REMINDER_WINDOW_HOURS = 24
const SCAN_BATCH_SIZE = 50

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PastoralOneOnOneForReminder {
  readonly id: string
  readonly mentor_persona_id: string
  readonly assisted_persona_id: string
  readonly scheduled_at: string
  readonly mentor_name: string
  readonly assisted_name: string
}

export interface NotificationSchedulerDeps {
  supabase: SupabaseClient
}

export interface NotificationSchedulerOptions {
  /** Interval in ms between scans. Default: 60_000 (1 minute) */
  intervalMs?: number
  /** Hour window to scan ahead. Default: 24 */
  scanHoursAhead?: number
}

// ─── Query to find 1:1s needing reminder ───────────────────────────────────

function buildReminderScanQuery(supabase: SupabaseClient, windowHours: number) {
  const now = new Date()
  const windowStart = new Date(now.getTime() + (windowHours - 1) * 60 * 60 * 1000)
  const windowEnd = new Date(now.getTime() + (windowHours + 1) * 60 * 60 * 1000)

  return supabase
    .from('pastoral_one_on_one')
    .select('id, mentor_persona_id, assisted_persona_id, scheduled_at')
    .gte('scheduled_at', windowStart.toISOString())
    .lte('scheduled_at', windowEnd.toISOString())
    .neq('status', 'completed')
    .neq('status', 'cancelled')
    .limit(SCAN_BATCH_SIZE)
}

// ─── Resolve persona names ────────────────────────────────────────────────────

async function resolvePersonaNames(
  supabase: SupabaseClient,
  mentorPersonaId: string,
  assistedPersonaId: string,
): Promise<{ mentorName: string; assistedName: string }> {
  const { data: personas } = await supabase
    .from('persona')
    .select('id, nombre, apellido')
    .in('id', [mentorPersonaId, assistedPersonaId])

  if (!personas) {
    return { mentorName: 'Tu líder', assistedName: 'el asistido' }
  }

  const mentor = personas.find((p) => p.id === mentorPersonaId)
  const assisted = personas.find((p) => p.id === assistedPersonaId)

  return {
    mentorName: mentor ? `${mentor.nombre} ${mentor.apellido}`.trim() : 'Tu líder',
    assistedName: assisted ? `${assisted.nombre} ${assisted.apellido}`.trim() : 'el asistido',
  }
}

// ─── Insert outbox entries ───────────────────────────────────────────────────

async function insertOutboxEntries(
  supabase: SupabaseClient,
  entries: ReturnType<typeof mapPastoralEventToOutboxEntries>,
): Promise<void> {
  if (entries.length === 0) return

  const rows = entries.map((entry) => ({
    kind: entry.kind,
    subject_id: entry.subjectId,
    template_key: entry.templateKey,
    target_kind: entry.targetKind,
    target_address: entry.targetAddress,
    payload: entry.payload,
    available_at: entry.availableAt,
    max_attempts: 3,
  }))

  const { error } = await supabase.from('operating_core_notification_outbox').insert(rows)

  if (error) {
    console.error('[pastoral-notification-scheduler] Failed to insert outbox entries:', error)
    throw error
  }
}

// ─── Main scan function ──────────────────────────────────────────────────────

/**
 * Scans for 1:1s needing reminder and emits outbox entries.
 * Idempotent: won't double-send for the same 1:1 within the window.
 */
export async function scanAndEmitReminders(
  deps: NotificationSchedulerDeps,
  options: NotificationSchedulerOptions = {},
): Promise<{ scanned: number; emitted: number }> {
  const { supabase } = deps
  const windowHours = options.scanHoursAhead ?? REMINDER_WINDOW_HOURS

  // 1. Scan for 1:1s in reminder window
  const { data: oneOnOnes, error } = await buildReminderScanQuery(supabase, windowHours)
    .select('id, mentor_persona_id, assisted_persona_id, scheduled_at')

  if (error) {
    console.error('[pastoral-notification-scheduler] Scan query failed:', error)
    return { scanned: 0, emitted: 0 }
  }

  if (!oneOnOnes || oneOnOnes.length === 0) {
    return { scanned: 0, emitted: 0 }
  }

  let totalEmitted = 0

  // 2. For each 1:1, emit reminder for both mentor and assisted
  for (const oo of oneOnOnes as PastoralOneOnOneForReminder[]) {
    const { mentorName, assistedName } = await resolvePersonaNames(
      supabase,
      oo.mentor_persona_id,
      oo.assisted_persona_id,
    )

    const hoursUntil = Math.round(
      (new Date(oo.scheduled_at).getTime() - Date.now()) / (1000 * 60 * 60),
    )

    const payload: PastoralNotificationPayload = {
      oneOnOneId: oo.id,
      leaderName: mentorName,
      assistedName: assistedName,
      eventDate: oo.scheduled_at,
      hoursUntil,
    }

    const recipients = [
      { personaId: oo.mentor_persona_id, role: 'mentor' as const },
      { personaId: oo.assisted_persona_id, role: 'assisted' as const },
    ]

    const entries = mapPastoralEventToOutboxEntries(
      'pastoral_one_on_one_reminder',
      recipients,
      payload,
    )

    await insertOutboxEntries(supabase, entries)
    totalEmitted += entries.length
  }

  return { scanned: oneOnOnes.length, emitted: totalEmitted }
}

// ─── In-memory scheduler (MVP) ──────────────────────────────────────────────

let schedulerInterval: ReturnType<typeof setInterval> | null = null

/**
 * Starts the in-memory notification scheduler.
 * MVP: simple setInterval-based worker.
 * Production: would use Vercel Cron or external job scheduler.
 */
export function startNotificationScheduler(
  deps: NotificationSchedulerDeps,
  options: NotificationSchedulerOptions = {},
): void {
  if (schedulerInterval) {
    console.warn('[pastoral-notification-scheduler] Already running, skipping start.')
    return
  }

  const intervalMs = options.intervalMs ?? 60_000

  // Run immediately on start
  scanAndEmitReminders(deps, options).catch((err) => {
    console.error('[pastoral-notification-scheduler] Initial scan failed:', err)
  })

  // Then run on interval
  schedulerInterval = setInterval(() => {
    scanAndEmitReminders(deps, options).catch((err) => {
      console.error('[pastoral-notification-scheduler] Scheduled scan failed:', err)
    })
  }, intervalMs)

  console.log(`[pastoral-notification-scheduler] Started with interval ${intervalMs}ms`)
}

/**
 * Stops the notification scheduler.
 */
export function stopNotificationScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
    console.log('[pastoral-notification-scheduler] Stopped')
  }
}
