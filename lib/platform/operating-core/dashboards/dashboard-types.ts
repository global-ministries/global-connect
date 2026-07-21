/**
 * S21 — Dashboard types for Operating Core.
 * Distinct from lib/dashboard/obtenerDatosDashboard.ts (Fase 2 — untouched).
 */

// ---------------------------------------------------------------------------
// View union — closed set, adding requires new capability key + version bump
// ---------------------------------------------------------------------------
export const DASHBOARD_VIEWS = ['director', 'lider', 'operador'] as const
export type DashboardView = (typeof DASHBOARD_VIEWS)[number]

// ---------------------------------------------------------------------------
// Director widgets
// ---------------------------------------------------------------------------
export interface DirectorWidgets {
  counts: {
    totalUsers: number
    totalActiveGroups: number
    totalEvents: number
    segmentDistribution: { segment: string; count: number }[]
  }
  alerts: {
    pendingHostHomeReviews: number
    groupsWithoutHostHome: number
    upcomingEventsNeedingCoverage: number
  }
  pending: {
    pendingReviewItems: number
    awaitingApproval: number
  }
}

// ---------------------------------------------------------------------------
// Líder widgets — distinguishes registration vs attendance per spec
// ---------------------------------------------------------------------------
export interface LiderWidgets {
  members: {
    activeMembers: number
    inactiveMembers: number
    pendingInvites: number
  }
  nextMeeting: {
    eventId: string
    eventName: string
    eventDate: string
    daysUntil: number
  }
  pending: {
    // Distinct per spec: registration vs attendance are separate metrics
    pendingRegistrations: number
    pendingCaptures: number
  }
}

// ---------------------------------------------------------------------------
// Operador widget
// ---------------------------------------------------------------------------
export interface OperadorWidgets {
  currentEvent: {
    eventId: string | null
    eventName: string | null
    attendees: number // confirmed registrations
    pendingCaptures: number // captures in progress
  }
}

// ---------------------------------------------------------------------------
// Discriminated union by view
// ---------------------------------------------------------------------------
export type DashboardWidgets = DirectorWidgets | LiderWidgets | OperadorWidgets

// ---------------------------------------------------------------------------
// Dashboard data envelope
// ---------------------------------------------------------------------------
export interface DashboardData {
  view: DashboardView
  widgets: DashboardWidgets
  /** ISO timestamp when data was generated */
  generatedAt: string
  flags: {
    /** True if data is stub (placeholder); false if real query result */
    isFallback: boolean
  }
}
