/**
 * S21 — Líder dashboard widget stub.
 * Returns placeholder data with flags.isFallback = true.
 * Real data queries will come in a future slice.
 */
import type { LiderWidgets } from '../../../../lib/platform/operating-core/dashboards/dashboard-types'

// STUB: returns placeholder widget data. Real data queries in future slice.
export function getLiderWidgetsStub(): LiderWidgets {
  return {
    members: {
      activeMembers: 0,
      inactiveMembers: 0,
      pendingInvites: 0,
    },
    nextMeeting: {
      eventId: '',
      eventName: '',
      eventDate: '',
      daysUntil: 0,
    },
    pending: {
      // Distinct per spec: registration vs attendance are separate metrics
      pendingRegistrations: 0,
      pendingCaptures: 0,
    },
  }
}
