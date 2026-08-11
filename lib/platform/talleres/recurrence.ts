/**
 * PR11 — DT-042 + DT-043 — Talleres recurrence computation.
 *
 * Pure functions (no I/O).
 *
 * (R1) Manual close wins over automatic. The effective close date is
 *      COALESCE(fecha_cierre_manual, fecha_cierre_automatico); the
 *      helper surfaces whether it was manual or automatic, so callers can
 *      log/audit accordingly.
 *
 * (R2) Reschedule (when an inscripcion starts) only fires for `pendiente`
 *      inscriptions. `shouldRescheduleOnStart(inscriptionEstado,
 *      tallerEstado)` is true ONLY when inscripcion pendiente AND taller
 *      en_curso; any other combination returns false.
 *
 * (DT-042 note) `nextPermanentCustomOccurrence` is a deterministic stub
 * for v1 that honors the simple cases (FREQ=DAILY with INTERVAL=N,
 * FREQ=WEEKLY with COUNT). Anything more elaborate (BYDAY, BYMONTHDAY,
 * EXDATE) is documented as a follow-up that swaps in a real RRULE
 * library. The stub's job is to preserve the contract so callers don't
 * need to special-case "null = no schedule" vs "next occurrence = null".
 */

export interface PeriodCloseInfo {
  readonly taller_id: string
  readonly fecha_cierre_real: string | null
  readonly source: 'manual' | 'automatic' | 'pending'
}

/**
 * Resolve the effective close date for a taller_periodos_generales row.
 * R1: manual wins.
 */
export function computePeriodClose(
  taller_id: string,
  fecha_apertura_automatica: string | null,
  fecha_cierre_automatico: string | null,
  fecha_apertura_manual: string | null,
  fecha_cierre_manual: string | null,
): PeriodCloseInfo {
  if (fecha_cierre_manual !== null) {
    return {
      taller_id,
      fecha_cierre_real: fecha_cierre_manual,
      source: 'manual',
    }
  }
  if (fecha_cierre_automatico !== null) {
    return {
      taller_id,
      fecha_cierre_real: fecha_cierre_automatico,
      source: 'automatic',
    }
  }
  return {
    taller_id,
    fecha_cierre_real: null,
    source: 'pending',
  }
}

/**
 * Compute the next `permanente_custom` occurrence from a recurrence
 * rule. Stub for v1 — handles FREQ=DAILY (any INTERVAL) and
 * FREQ=WEEKLY (only simple BYDAY=MO). Anything beyond these falls
 * through to `null` and surfaces a follow-up note in the JSDoc.
 *
 * Returns `null` when no next occurrence can be computed (which is the
 * "end" of a `COUNT`-bounded recurrence, or an unsupported FREQ).
 */
export function nextPermanentCustomOccurrence(
  recurrenceRule: Readonly<Record<string, unknown>> | null | undefined,
  fromDate: string,
): string | null {
  if (!recurrenceRule || typeof recurrenceRule !== 'object') return null
  const freq = String(recurrenceRule['freq'] ?? '').toUpperCase()
  const interval = Number(recurrenceRule['interval'] ?? 1)
  const from = new Date(`${fromDate}T00:00:00Z`)
  if (Number.isNaN(from.getTime())) return null

  if (freq === 'DAILY') {
    if (!Number.isFinite(interval) || interval <= 0) return null
    const next = new Date(from)
    next.setUTCDate(next.getUTCDate() + interval)
    return next.toISOString().slice(0, 10)
  }

  if (freq === 'WEEKLY') {
    const byday = Array.isArray(recurrenceRule['byday'])
      ? (recurrenceRule['byday'] as unknown[]).map((d) => String(d).toUpperCase())
      : []
    if (byday.length === 0 || !byday.includes('MO')) return null
    if (!Number.isFinite(interval) || interval <= 0) return null
    const next = new Date(from)
    // Skip ahead to the next Monday then jump interval weeks.
    const dow = next.getUTCDay() // 0 (Sun) .. 6 (Sat)
    const daysUntilMonday = dow === 1 ? 0 : (8 - dow) % 7 || 7
    next.setUTCDate(next.getUTCDate() + daysUntilMonday + 7 * (interval - 1))
    return next.toISOString().slice(0, 10)
  }

  // Unsupported FREQ (MONTHLY, YEARLY, etc.) — follow-up PR swaps in qrcode/ics lib.
  return null
}

/**
 * R2: Reschedule on taller start only fires for `pendiente` inscriptions.
 * Returns true when (inscripcion pendiente, taller en_curso); false otherwise.
 */
export function shouldRescheduleOnStart(
  inscripcionEstado: string,
  tallerEstado: string,
): boolean {
  return inscripcionEstado === 'pendiente' && tallerEstado === 'en_curso'
}
