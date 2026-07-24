/**
 * W14 — DT-085 — Kill switch route access test.
 *
 * Verifies that when the pastoral kill switch is ON, isPastoralRouteEnabled()
 * returns false, which causes all pastoral API routes to return 404.
 *
 * This test covers the kill-switch OFF requirement from the W14 scope.
 */

describe('kill switch — isPastoralRouteEnabled', () => {
  // We test isPastoralRouteEnabled directly since it is the gate used by all
  // pastoral API routes (isPastoralRouteEnabled → false → 404).
  // This is the most direct way to verify "kill switch OFF → all routes 404".

  it('isPastoralRouteEnabled returns false when killSwitch is on', async () => {
    // Dynamic import to get fresh module with overridden env
    const { isPastoralRouteEnabled } = await import('@/lib/platform/pastoral/route-access')
    // The function reads from process.env via isPastoralEnabled
    // We verify the flag-level behavior; actual 404 comes from the route handler
    // calling isPastoralRouteEnabled() and returning 404 when false.
    const result = isPastoralRouteEnabled({
      NEXT_PUBLIC_PASTORAL_ENABLED: 'on',
      NEXT_PUBLIC_PASTORAL_STAGE: 'public',
      NEXT_PUBLIC_PASTORAL_KILL_SWITCH: 'on',
    } as NodeJS.ProcessEnv)
    expect(result).toBe(false)
  })

  it('isPastoralRouteEnabled returns true when killSwitch is off and stage is public', async () => {
    const { isPastoralRouteEnabled } = await import('@/lib/platform/pastoral/route-access')
    const result = isPastoralRouteEnabled({
      NEXT_PUBLIC_PASTORAL_ENABLED: 'on',
      NEXT_PUBLIC_PASTORAL_STAGE: 'public',
      NEXT_PUBLIC_PASTORAL_KILL_SWITCH: '',
    } as NodeJS.ProcessEnv)
    expect(result).toBe(true)
  })

  it('isPastoralRouteEnabled returns false when pastoral is not enabled', async () => {
    const { isPastoralRouteEnabled } = await import('@/lib/platform/pastoral/route-access')
    // No NEXT_PUBLIC_PASTORAL_ENABLED set
    const result = isPastoralRouteEnabled({} as NodeJS.ProcessEnv)
    expect(result).toBe(false)
  })
})
