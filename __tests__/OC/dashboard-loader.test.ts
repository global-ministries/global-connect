/**
 * S21 TDD RED — dashboard loader tests
 *
 * Tests cover:
 * - DASHBOARD_VIEWS union has exactly 3 values
 * - loadDashboardData with null session → no_session error
 * - loadDashboardData with session lacking capability → no_capability error
 * - loadDashboardData with valid session + director view → stub data with isFallback=true
 * - loadDashboardData with valid session + lider view → stub data with isFallback=true
 * - loadDashboardData with valid session + operador view → stub data with isFallback=true
 * - loadDashboardData with invalid view → unknown_view error
 * - NO role-string checks (capability-based only)
 */
import { loadDashboardData } from '@/lib/platform/operating-core/dashboards/loader'
import { DASHBOARD_VIEWS } from '@/lib/platform/operating-core/dashboards/dashboard-types'
import type { PlatformSession } from '@/lib/platform/session/types'

// ---------------------------------------------------------------------------
// Helper: minimal session with specific capabilities
// ---------------------------------------------------------------------------
function sessionWithCapability(key: string): PlatformSession {
  return {
    personaId: 'persona-1',
    subjectAuthId: 'auth-1',
    globalRoles: [],
    contexts: [],
    capabilities: [
      {
        key,
        experience: 'operating_core',
        scopeType: 'experience',
        source: 'test',
      },
    ],
  }
}

function sessionWithoutCapability(): PlatformSession {
  return {
    personaId: 'persona-2',
    subjectAuthId: 'auth-2',
    globalRoles: [],
    contexts: [],
    capabilities: [],
  }
}

// ---------------------------------------------------------------------------
// DASHBOARD_VIEWS union size
// ---------------------------------------------------------------------------
describe('DASHBOARD_VIEWS', () => {
  it('should contain exactly 3 values', () => {
    expect(DASHBOARD_VIEWS).toHaveLength(3)
  })

  it('should contain director, lider, operador', () => {
    expect(DASHBOARD_VIEWS).toContain('director')
    expect(DASHBOARD_VIEWS).toContain('lider')
    expect(DASHBOARD_VIEWS).toContain('operador')
  })
})

// ---------------------------------------------------------------------------
// loadDashboardData — session null
// ---------------------------------------------------------------------------
describe('loadDashboardData', () => {
  const NOW = '2026-07-20T12:00:00.000Z'

  it('returns no_session error when session is null', async () => {
    const result = await loadDashboardData({ view: 'director', session: null, nowIso: NOW })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('no_session')
    }
  })

  // ---------------------------------------------------------------------------
  // loadDashboardData — capability gating
  // ---------------------------------------------------------------------------
  it('returns no_capability error when session lacks operating_core.dashboards.read', async () => {
    const session = sessionWithoutCapability()
    const result = await loadDashboardData({ view: 'director', session, nowIso: NOW })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('no_capability')
    }
  })

  // ---------------------------------------------------------------------------
  // loadDashboardData — director view (stub with isFallback=true)
  // ---------------------------------------------------------------------------
  it('returns stub data with isFallback=true for director view', async () => {
    const session = sessionWithCapability('operating_core.dashboards.read')
    const result = await loadDashboardData({ view: 'director', session, nowIso: NOW })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.view).toBe('director')
      expect(result.data.flags.isFallback).toBe(true)
      // Widgets shape
      expect(result.data.widgets).toHaveProperty('counts')
      expect(result.data.widgets).toHaveProperty('alerts')
      expect(result.data.widgets).toHaveProperty('pending')
    }
  })

  // ---------------------------------------------------------------------------
  // loadDashboardData — lider view (stub with isFallback=true)
  // ---------------------------------------------------------------------------
  it('returns stub data with isFallback=true for lider view', async () => {
    const session = sessionWithCapability('operating_core.dashboards.read')
    const result = await loadDashboardData({ view: 'lider', session, nowIso: NOW })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.view).toBe('lider')
      expect(result.data.flags.isFallback).toBe(true)
      // Widgets shape — members, nextMeeting, pending
      expect(result.data.widgets).toHaveProperty('members')
      expect(result.data.widgets).toHaveProperty('nextMeeting')
      expect(result.data.widgets).toHaveProperty('pending')
    }
  })

  // ---------------------------------------------------------------------------
  // loadDashboardData — operador view (stub with isFallback=true)
  // ---------------------------------------------------------------------------
  it('returns stub data with isFallback=true for operador view', async () => {
    const session = sessionWithCapability('operating_core.dashboards.read')
    const result = await loadDashboardData({ view: 'operador', session, nowIso: NOW })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.view).toBe('operador')
      expect(result.data.flags.isFallback).toBe(true)
      // Widgets shape — currentEvent
      expect(result.data.widgets).toHaveProperty('currentEvent')
    }
  })

  // ---------------------------------------------------------------------------
  // loadDashboardData — invalid view
  // ---------------------------------------------------------------------------
  it('returns unknown_view error for invalid view string', async () => {
    const session = sessionWithCapability('operating_core.dashboards.read')
    // @ts-expect-error — intentionally passing invalid literal
    const result = await loadDashboardData({ view: 'admin', session, nowIso: NOW })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('unknown_view')
    }
  })

  // ---------------------------------------------------------------------------
  // loadDashboardData — generatedAt is ISO string
  // ---------------------------------------------------------------------------
  it('includes generatedAt as ISO string in response', async () => {
    const session = sessionWithCapability('operating_core.dashboards.read')
    const result = await loadDashboardData({ view: 'director', session, nowIso: NOW })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(typeof result.data.generatedAt).toBe('string')
      // Should match the nowIso passed in
      expect(result.data.generatedAt).toBe(NOW)
    }
  })

  // ---------------------------------------------------------------------------
  // LiderWidgets — registration vs attendance distinguished
  // ---------------------------------------------------------------------------
  it('lider widgets has pending.pendingRegistrations and pending.pendingCaptures', async () => {
    const session = sessionWithCapability('operating_core.dashboards.read')
    const result = await loadDashboardData({ view: 'lider', session, nowIso: NOW })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const widgets = result.data.widgets as import('@/lib/platform/operating-core/dashboards/dashboard-types').LiderWidgets
      expect(widgets.pending).toHaveProperty('pendingRegistrations')
      expect(widgets.pending).toHaveProperty('pendingCaptures')
    }
  })

  // ---------------------------------------------------------------------------
  // OperadorWidgets — attendees vs pendingCaptures distinguished
  // ---------------------------------------------------------------------------
  it('operador widgets has currentEvent.attendees and currentEvent.pendingCaptures', async () => {
    const session = sessionWithCapability('operating_core.dashboards.read')
    const result = await loadDashboardData({ view: 'operador', session, nowIso: NOW })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const widgets = result.data.widgets as import('@/lib/platform/operating-core/dashboards/dashboard-types').OperadorWidgets
      expect(widgets.currentEvent).toHaveProperty('attendees')
      expect(widgets.currentEvent).toHaveProperty('pendingCaptures')
    }
  })

  // ---------------------------------------------------------------------------
  // All stub widgets return zeros
  // ---------------------------------------------------------------------------
  it('director stub widgets return zeros for counts', async () => {
    const session = sessionWithCapability('operating_core.dashboards.read')
    const result = await loadDashboardData({ view: 'director', session, nowIso: NOW })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const widgets = result.data.widgets as import('@/lib/platform/operating-core/dashboards/dashboard-types').DirectorWidgets
      expect(widgets.counts.totalUsers).toBe(0)
      expect(widgets.counts.totalActiveGroups).toBe(0)
      expect(widgets.counts.totalEvents).toBe(0)
    }
  })

  it('lider stub widgets return zeros for pending counts', async () => {
    const session = sessionWithCapability('operating_core.dashboards.read')
    const result = await loadDashboardData({ view: 'lider', session, nowIso: NOW })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const widgets = result.data.widgets as import('@/lib/platform/operating-core/dashboards/dashboard-types').LiderWidgets
      expect(widgets.pending.pendingRegistrations).toBe(0)
      expect(widgets.pending.pendingCaptures).toBe(0)
    }
  })

  it('operador stub widgets return zeros for currentEvent counts', async () => {
    const session = sessionWithCapability('operating_core.dashboards.read')
    const result = await loadDashboardData({ view: 'operador', session, nowIso: NOW })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const widgets = result.data.widgets as import('@/lib/platform/operating-core/dashboards/dashboard-types').OperadorWidgets
      expect(widgets.currentEvent.attendees).toBe(0)
      expect(widgets.currentEvent.pendingCaptures).toBe(0)
    }
  })
})
