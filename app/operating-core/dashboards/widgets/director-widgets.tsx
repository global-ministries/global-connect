/**
 * S21 — Director dashboard widget stub.
 * Returns placeholder data with flags.isFallback = true.
 * Real data queries will come in a future slice.
 */
import type { DirectorWidgets } from '../../../../lib/platform/operating-core/dashboards/dashboard-types'

// STUB: returns placeholder widget data. Real data queries in future slice.
export function getDirectorWidgetsStub(): DirectorWidgets {
  return {
    counts: {
      totalUsers: 0,
      totalActiveGroups: 0,
      totalEvents: 0,
      segmentDistribution: [],
    },
    alerts: {
      pendingHostHomeReviews: 0,
      groupsWithoutHostHome: 0,
      upcomingEventsNeedingCoverage: 0,
    },
    pending: {
      pendingReviewItems: 0,
      awaitingApproval: 0,
    },
  }
}
