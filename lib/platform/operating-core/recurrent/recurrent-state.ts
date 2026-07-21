/**
 * S22 — Recurrent event state functions.
 *
 * Pure, deterministic functions for:
 * - generateInstanceDates: generate dates from a recurrence rule within a horizon
 * - isOutOfHorizon: check if a date is beyond the horizon
 * - validateRecurrenceRule: runtime validation of a recurrence rule
 *
 * These are synchronous and have no side effects (no I/O, no randomness).
 * Determinism: same inputs → same outputs.
 */

import type { RecurrenceRule } from './recurrent-types'

const VALID_FREQS: readonly string[] = ['daily', 'weekly', 'monthly', 'yearly']
const VALID_WEEKDAYS: readonly number[] = [0, 1, 2, 3, 4, 5, 6]

/**
 * Validate a recurrence rule at runtime.
 * Returns true if the rule is valid, false otherwise.
 */
export function validateRecurrenceRule(rule: RecurrenceRule): boolean {
  // Check freq
  if (!VALID_FREQS.includes(rule.freq)) {
    return false
  }

  // Check interval
  if (typeof rule.interval !== 'number' || rule.interval <= 0) {
    return false
  }

  // Check byDay values
  if (rule.byDay !== null) {
    for (const day of rule.byDay) {
      if (!VALID_WEEKDAYS.includes(day)) {
        return false
      }
    }
  }

  // count and until are both optional but at least one makes sense
  // (an infinite recurrence is valid — it just respects the horizon)
  if (rule.count !== null && rule.count < 0) {
    return false
  }

  return true
}

/**
 * Generate instance dates from a recurrence rule within a horizon.
 *
 * Deterministic: same (rule, start_date, horizon_days) → same dates.
 *
 * @param rule - The recurrence rule (RRULE subset)
 * @param startDate - ISO date string YYYY-MM-DD (the event's start date)
 * @param horizonDays - Maximum number of days to generate (exclusive upper bound)
 * @returns object with dates array and out_of_horizon flag
 */
export function generateInstanceDates(
  rule: RecurrenceRule,
  startDate: string,
  horizonDays: number,
): { dates: string[]; out_of_horizon: boolean } {
  const dates: string[] = []
  const start = new Date(startDate + 'T00:00:00Z')
  const horizonMs = horizonDays * 24 * 60 * 60 * 1000
  const horizonDate = new Date(start.getTime() + horizonMs)
  const untilDate = rule.until !== null ? new Date(rule.until + 'T00:00:00Z') : null

  let current = new Date(start)
  let count = 0
  const maxCount = rule.count ?? Infinity

  while (current < horizonDate && count < maxCount) {
    // Check until boundary BEFORE adding (until is EXCLUSIVE — stop before until)
    if (untilDate !== null && current >= untilDate) {
      break
    }

    const dayOfWeek = current.getDay()

    // Check byDay filter
    const matchesByDay =
      rule.byDay === null || rule.byDay.length === 0 || rule.byDay.includes(dayOfWeek)

    if (matchesByDay) {
      dates.push(formatDate(current))
      count++
    }

    // Advance to next occurrence
    if (rule.byDay !== null && rule.byDay.length > 0) {
      // For byDay, advance one day at a time until we find a matching day
      current = new Date(current.getTime() + 24 * 60 * 60 * 1000)
      while (
        current < horizonDate &&
        count < maxCount &&
        !rule.byDay!.includes(current.getDay())
      ) {
        current = new Date(current.getTime() + 24 * 60 * 60 * 1000)
      }
    } else if (rule.freq === 'daily') {
      current = new Date(current.getTime() + rule.interval * 24 * 60 * 60 * 1000)
    } else if (rule.freq === 'weekly') {
      current = new Date(current.getTime() + rule.interval * 7 * 24 * 60 * 60 * 1000)
    } else if (rule.freq === 'monthly') {
      // Add interval months to the current date
      current = addMonths(current, rule.interval)
    } else if (rule.freq === 'yearly') {
      current = new Date(
        Date.UTC(
          current.getUTCFullYear() + rule.interval,
          current.getUTCMonth(),
          current.getUTCDate(),
        ),
      )
    }
  }

  return { dates, out_of_horizon: false }
}

/**
 * Check if a requested date is beyond the horizon.
 *
 * @param requestedDate - ISO date string YYYY-MM-DD to check
 * @param startDate - ISO date string YYYY-MM-DD (the event's start date)
 * @param horizonDays - Maximum days from startDate to consider in horizon
 * @returns true if requestedDate > startDate + horizonDays (horizon boundary is exclusive)
 */
export function isOutOfHorizon(
  requestedDate: string,
  startDate: string,
  horizonDays: number,
): boolean {
  const start = new Date(startDate + 'T00:00:00Z')
  const requested = new Date(requestedDate + 'T00:00:00Z')
  const horizonMs = horizonDays * 24 * 60 * 60 * 1000
  const horizonDate = new Date(start.getTime() + horizonMs)

  // Apr 1 with 90-day horizon from Jan 1 is the 90th day — within horizon
  return requested > horizonDate
}

/**
 * Format a Date to ISO YYYY-MM-DD string.
 */
function formatDate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Add months to a date, handling month overflow.
 */
function addMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + months
  const day = date.getUTCDate()

  // Calculate target year and month
  const targetYear = Math.floor(month / 12)
  const targetMonth = month % 12

  // Create date in target month (handles days > month length)
  const lastDayOfMonth = new Date(Date.UTC(year + targetYear, targetMonth + 1, 0)).getUTCDate()
  const targetDay = Math.min(day, lastDayOfMonth)

  return new Date(Date.UTC(year + targetYear, targetMonth, targetDay))
}
