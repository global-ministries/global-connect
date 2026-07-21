/**
 * S21 — Operador dashboard widget stub.
 * Returns placeholder data with flags.isFallback = true.
 * Real data queries will come in a future slice.
 */
import type { OperadorWidgets } from '../../../../lib/platform/operating-core/dashboards/dashboard-types'

// STUB: returns placeholder widget data. Real data queries in future slice.
export function getOperadorWidgetsStub(): OperadorWidgets {
  return {
    currentEvent: {
      eventId: null,
      eventName: null,
      attendees: 0,
      pendingCaptures: 0,
    },
  }
}
