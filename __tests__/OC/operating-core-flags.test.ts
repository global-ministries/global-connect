/**
 * S23 — Operating Core flags parsing tests.
 *
 * Tests the sibling flags module at lib/platform/operating-core/flags.ts.
 * Mirrors lib/platform/flags.ts pattern for Dream Team.
 */

import { getOperatingCoreFlags } from '@/lib/platform/operating-core/flags'

describe('getOperatingCoreFlags', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
    // Clear all OC env vars
    delete process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED
    delete process.env.NEXT_PUBLIC_OPERATING_CORE_STAGE
    delete process.env.NEXT_PUBLIC_OPERATING_CORE_KILL_SWITCH
    delete process.env.NEXT_PUBLIC_OPERATING_CORE_MIN_APP_VERSION
    delete process.env.NEXT_PUBLIC_OPERATING_CORE_EVENTS
    delete process.env.NEXT_PUBLIC_OPERATING_CORE_SERVICES
    delete process.env.NEXT_PUBLIC_OPERATING_CORE_CAPACITY
    delete process.env.NEXT_PUBLIC_OPERATING_CORE_FORMS
    delete process.env.NEXT_PUBLIC_OPERATING_CORE_RESOURCES
    delete process.env.NEXT_PUBLIC_OPERATING_CORE_PUBLIC_TOKENS
    delete process.env.NEXT_PUBLIC_OPERATING_CORE_NOTIFICATIONS
    delete process.env.NEXT_PUBLIC_OPERATING_CORE_CAPTURE_UX
    delete process.env.NEXT_PUBLIC_OPERATING_CORE_DASHBOARDS
    delete process.env.NEXT_PUBLIC_OPERATING_CORE_RECURRENT
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns all subphase flags as false when env vars not set', () => {
    const flags = getOperatingCoreFlags()
    expect(flags.subphaseFlags.events).toBe(false)
    expect(flags.subphaseFlags.services).toBe(false)
    expect(flags.subphaseFlags.capacity).toBe(false)
    expect(flags.subphaseFlags.forms).toBe(false)
    expect(flags.subphaseFlags.resources).toBe(false)
    expect(flags.subphaseFlags.publicTokens).toBe(false)
    expect(flags.subphaseFlags.notifications).toBe(false)
    expect(flags.subphaseFlags.captureUx).toBe(false)
    expect(flags.subphaseFlags.dashboards).toBe(false)
    expect(flags.subphaseFlags.recurrent).toBe(false)
  })

  it('returns enabled=false when NEXT_PUBLIC_OPERATING_CORE_ENABLED is not set', () => {
    const flags = getOperatingCoreFlags()
    expect(flags.enabled).toBe(false)
  })

  it('returns enabled=true when NEXT_PUBLIC_OPERATING_CORE_ENABLED is "on"', () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED = 'on'
    const flags = getOperatingCoreFlags()
    expect(flags.enabled).toBe(true)
  })

  it('returns enabled=false when NEXT_PUBLIC_OPERATING_CORE_ENABLED is "off"', () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED = 'off'
    const flags = getOperatingCoreFlags()
    expect(flags.enabled).toBe(false)
  })

  it('returns rolloutStage=off by default', () => {
    const flags = getOperatingCoreFlags()
    expect(flags.rolloutStage).toBe('off')
  })

  it('returns rolloutStage=admin-only when NEXT_PUBLIC_OPERATING_CORE_STAGE is admin-only', () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_STAGE = 'admin-only'
    const flags = getOperatingCoreFlags()
    expect(flags.rolloutStage).toBe('admin-only')
  })

  it('returns rolloutStage=internal when NEXT_PUBLIC_OPERATING_CORE_STAGE is internal', () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_STAGE = 'internal'
    const flags = getOperatingCoreFlags()
    expect(flags.rolloutStage).toBe('internal')
  })

  it('returns rolloutStage=public when NEXT_PUBLIC_OPERATING_CORE_STAGE is public', () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_STAGE = 'public'
    const flags = getOperatingCoreFlags()
    expect(flags.rolloutStage).toBe('public')
  })

  it('returns rolloutStage=off for invalid stage values', () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_STAGE = 'invalid'
    const flags = getOperatingCoreFlags()
    expect(flags.rolloutStage).toBe('off')
  })

  it('returns killSwitch=false by default', () => {
    const flags = getOperatingCoreFlags()
    expect(flags.killSwitch).toBe(false)
  })

  it('returns killSwitch=true when NEXT_PUBLIC_OPERATING_CORE_KILL_SWITCH is "on"', () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_KILL_SWITCH = 'on'
    const flags = getOperatingCoreFlags()
    expect(flags.killSwitch).toBe(true)
  })

  it('returns minAppVersion=null when NEXT_PUBLIC_OPERATING_CORE_MIN_APP_VERSION is not set', () => {
    const flags = getOperatingCoreFlags()
    expect(flags.minAppVersion).toBe(null)
  })

  it('returns minAppVersion when NEXT_PUBLIC_OPERATING_CORE_MIN_APP_VERSION is set', () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_MIN_APP_VERSION = '1.2.3'
    const flags = getOperatingCoreFlags()
    expect(flags.minAppVersion).toBe('1.2.3')
  })

  it('enables events subphase when NEXT_PUBLIC_OPERATING_CORE_EVENTS is "on"', () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_EVENTS = 'on'
    const flags = getOperatingCoreFlags()
    expect(flags.subphaseFlags.events).toBe(true)
  })

  it('enables services subphase when NEXT_PUBLIC_OPERATING_CORE_SERVICES is "on"', () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_SERVICES = 'on'
    const flags = getOperatingCoreFlags()
    expect(flags.subphaseFlags.services).toBe(true)
  })

  it('enables capacity subphase when NEXT_PUBLIC_OPERATING_CORE_CAPACITY is "on"', () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_CAPACITY = 'on'
    const flags = getOperatingCoreFlags()
    expect(flags.subphaseFlags.capacity).toBe(true)
  })

  it('enables forms subphase when NEXT_PUBLIC_OPERATING_CORE_FORMS is "on"', () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_FORMS = 'on'
    const flags = getOperatingCoreFlags()
    expect(flags.subphaseFlags.forms).toBe(true)
  })

  it('enables resources subphase when NEXT_PUBLIC_OPERATING_CORE_RESOURCES is "on"', () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_RESOURCES = 'on'
    const flags = getOperatingCoreFlags()
    expect(flags.subphaseFlags.resources).toBe(true)
  })

  it('enables publicTokens subphase when NEXT_PUBLIC_OPERATING_CORE_PUBLIC_TOKENS is "on"', () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_PUBLIC_TOKENS = 'on'
    const flags = getOperatingCoreFlags()
    expect(flags.subphaseFlags.publicTokens).toBe(true)
  })

  it('enables notifications subphase when NEXT_PUBLIC_OPERATING_CORE_NOTIFICATIONS is "on"', () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_NOTIFICATIONS = 'on'
    const flags = getOperatingCoreFlags()
    expect(flags.subphaseFlags.notifications).toBe(true)
  })

  it('enables captureUx subphase when NEXT_PUBLIC_OPERATING_CORE_CAPTURE_UX is "on"', () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_CAPTURE_UX = 'on'
    const flags = getOperatingCoreFlags()
    expect(flags.subphaseFlags.captureUx).toBe(true)
  })

  it('enables dashboards subphase when NEXT_PUBLIC_OPERATING_CORE_DASHBOARDS is "on"', () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_DASHBOARDS = 'on'
    const flags = getOperatingCoreFlags()
    expect(flags.subphaseFlags.dashboards).toBe(true)
  })

  it('enables recurrent subphase when NEXT_PUBLIC_OPERATING_CORE_RECURRENT is "on"', () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_RECURRENT = 'on'
    const flags = getOperatingCoreFlags()
    expect(flags.subphaseFlags.recurrent).toBe(true)
  })

  it('accepts custom env object when provided', () => {
    const customEnv: NodeJS.ProcessEnv = {
      ...process.env,
      NEXT_PUBLIC_OPERATING_CORE_ENABLED: 'on',
      NEXT_PUBLIC_OPERATING_CORE_STAGE: 'internal',
      NEXT_PUBLIC_OPERATING_CORE_KILL_SWITCH: 'on',
      NEXT_PUBLIC_OPERATING_CORE_EVENTS: 'on',
    }
    const flags = getOperatingCoreFlags(customEnv)
    expect(flags.enabled).toBe(true)
    expect(flags.rolloutStage).toBe('internal')
    expect(flags.killSwitch).toBe(true)
    expect(flags.subphaseFlags.events).toBe(true)
  })

  it('returns all subphase flags false when env vars are empty string', () => {
    process.env.NEXT_PUBLIC_OPERATING_CORE_EVENTS = ''
    process.env.NEXT_PUBLIC_OPERATING_CORE_SERVICES = ''
    const flags = getOperatingCoreFlags()
    expect(flags.subphaseFlags.events).toBe(false)
    expect(flags.subphaseFlags.services).toBe(false)
  })
})
