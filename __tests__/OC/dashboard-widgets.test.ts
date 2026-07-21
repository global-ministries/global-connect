/**
 * S21 TDD RED — dashboard widget stub tests
 *
 * Verifies:
 * - getDirectorWidgetsStub returns correct shape (DirectorWidgets)
 * - getLiderWidgetsStub returns correct shape (LiderWidgets) with registration vs attendance distinction
 * - getOperadorWidgetsStub returns correct shape (OperadorWidgets)
 * - All stubs return zeros (placeholder data)
 */
import { getDirectorWidgetsStub } from '@/app/operating-core/dashboards/widgets/director-widgets'
import { getLiderWidgetsStub } from '@/app/operating-core/dashboards/widgets/lider-widgets'
import { getOperadorWidgetsStub } from '@/app/operating-core/dashboards/widgets/operador-widgets'

// ---------------------------------------------------------------------------
// DirectorWidgets stub
// ---------------------------------------------------------------------------
describe('getDirectorWidgetsStub', () => {
  it('returns an object with counts, alerts, pending', () => {
    const widgets = getDirectorWidgetsStub()
    expect(widgets).toHaveProperty('counts')
    expect(widgets).toHaveProperty('alerts')
    expect(widgets).toHaveProperty('pending')
  })

  it('counts has totalUsers, totalActiveGroups, totalEvents, segmentDistribution', () => {
    const { counts } = getDirectorWidgetsStub()
    expect(counts).toHaveProperty('totalUsers')
    expect(counts).toHaveProperty('totalActiveGroups')
    expect(counts).toHaveProperty('totalEvents')
    expect(counts).toHaveProperty('segmentDistribution')
    expect(Array.isArray(counts.segmentDistribution)).toBe(true)
  })

  it('alerts has pendingHostHomeReviews, groupsWithoutHostHome, upcomingEventsNeedingCoverage', () => {
    const { alerts } = getDirectorWidgetsStub()
    expect(alerts).toHaveProperty('pendingHostHomeReviews')
    expect(alerts).toHaveProperty('groupsWithoutHostHome')
    expect(alerts).toHaveProperty('upcomingEventsNeedingCoverage')
  })

  it('pending has pendingReviewItems, awaitingApproval', () => {
    const { pending } = getDirectorWidgetsStub()
    expect(pending).toHaveProperty('pendingReviewItems')
    expect(pending).toHaveProperty('awaitingApproval')
  })

  it('all numeric values are zero (placeholder)', () => {
    const { counts, alerts, pending } = getDirectorWidgetsStub()
    expect(counts.totalUsers).toBe(0)
    expect(counts.totalActiveGroups).toBe(0)
    expect(counts.totalEvents).toBe(0)
    expect(alerts.pendingHostHomeReviews).toBe(0)
    expect(alerts.groupsWithoutHostHome).toBe(0)
    expect(alerts.upcomingEventsNeedingCoverage).toBe(0)
    expect(pending.pendingReviewItems).toBe(0)
    expect(pending.awaitingApproval).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// LiderWidgets stub
// ---------------------------------------------------------------------------
describe('getLiderWidgetsStub', () => {
  it('returns an object with members, nextMeeting, pending', () => {
    const widgets = getLiderWidgetsStub()
    expect(widgets).toHaveProperty('members')
    expect(widgets).toHaveProperty('nextMeeting')
    expect(widgets).toHaveProperty('pending')
  })

  it('members has activeMembers, inactiveMembers, pendingInvites', () => {
    const { members } = getLiderWidgetsStub()
    expect(members).toHaveProperty('activeMembers')
    expect(members).toHaveProperty('inactiveMembers')
    expect(members).toHaveProperty('pendingInvites')
  })

  it('nextMeeting has eventId, eventName, eventDate, daysUntil', () => {
    const { nextMeeting } = getLiderWidgetsStub()
    expect(nextMeeting).toHaveProperty('eventId')
    expect(nextMeeting).toHaveProperty('eventName')
    expect(nextMeeting).toHaveProperty('eventDate')
    expect(nextMeeting).toHaveProperty('daysUntil')
  })

  // Registration vs attendance distinction — critical per spec
  it('pending has pendingRegistrations and pendingCaptures (registration vs attendance)', () => {
    const { pending } = getLiderWidgetsStub()
    expect(pending).toHaveProperty('pendingRegistrations')
    expect(pending).toHaveProperty('pendingCaptures')
    // Both must be present and distinct — registration ≠ attendance
    expect(typeof pending.pendingRegistrations).toBe('number')
    expect(typeof pending.pendingCaptures).toBe('number')
  })

  it('all numeric values are zero (placeholder)', () => {
    const { members, nextMeeting, pending } = getLiderWidgetsStub()
    expect(members.activeMembers).toBe(0)
    expect(members.inactiveMembers).toBe(0)
    expect(members.pendingInvites).toBe(0)
    expect(nextMeeting.daysUntil).toBe(0)
    expect(pending.pendingRegistrations).toBe(0)
    expect(pending.pendingCaptures).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// OperadorWidgets stub
// ---------------------------------------------------------------------------
describe('getOperadorWidgetsStub', () => {
  it('returns an object with currentEvent', () => {
    const widgets = getOperadorWidgetsStub()
    expect(widgets).toHaveProperty('currentEvent')
  })

  it('currentEvent has eventId, eventName, attendees, pendingCaptures', () => {
    const { currentEvent } = getOperadorWidgetsStub()
    expect(currentEvent).toHaveProperty('eventId')
    expect(currentEvent).toHaveProperty('eventName')
    expect(currentEvent).toHaveProperty('attendees')
    expect(currentEvent).toHaveProperty('pendingCaptures')
  })

  // Attendees vs pendingCaptures — registration vs attendance distinction per spec
  it('currentEvent has attendees and pendingCaptures as distinct fields', () => {
    const { currentEvent } = getOperadorWidgetsStub()
    expect(typeof currentEvent.attendees).toBe('number')
    expect(typeof currentEvent.pendingCaptures).toBe('number')
    // attendees = confirmed registrations; pendingCaptures = in-progress captures
    // These are semantically distinct even if both are 0 in stub
  })

  it('all numeric values are zero (placeholder)', () => {
    const { currentEvent } = getOperadorWidgetsStub()
    expect(currentEvent.attendees).toBe(0)
    expect(currentEvent.pendingCaptures).toBe(0)
    // eventId and eventName are null in stub
    expect(currentEvent.eventId).toBeNull()
    expect(currentEvent.eventName).toBeNull()
  })
})
