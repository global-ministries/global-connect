/**
 * W01 — DT-003 — Pastoral feature flags.
 * Sibling to lib/platform/operating-core/flags.ts (D10).
 * Verifies byte-identity of lib/platform/flags.ts (I-7) and
 * lib/platform/operating-core/flags.ts (sibling, no edits).
 */
import { execSync } from 'child_process'
import { getPastoralFlags, isPastoralEnabled, getPastoralStage, getPastoralStageGate } from '@/lib/platform/pastoral/flags'

describe('getPastoralFlags', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
    delete process.env.NEXT_PUBLIC_PASTORAL_ENABLED
    delete process.env.NEXT_PUBLIC_PASTORAL_STAGE
    delete process.env.NEXT_PUBLIC_PASTORAL_KILL_SWITCH
    delete process.env.NEXT_PUBLIC_PASTORAL_MIN_APP_VERSION
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns enabled=false when NEXT_PUBLIC_PASTORAL_ENABLED is not set', () => {
    const flags = getPastoralFlags()
    expect(flags.enabled).toBe(false)
  })

  it('returns enabled=true when NEXT_PUBLIC_PASTORAL_ENABLED is "on"', () => {
    process.env.NEXT_PUBLIC_PASTORAL_ENABLED = 'on'
    const flags = getPastoralFlags()
    expect(flags.enabled).toBe(true)
  })

  it('returns enabled=false when NEXT_PUBLIC_PASTORAL_ENABLED is "off"', () => {
    process.env.NEXT_PUBLIC_PASTORAL_ENABLED = 'off'
    const flags = getPastoralFlags()
    expect(flags.enabled).toBe(false)
  })

  it('returns stage=off by default', () => {
    const flags = getPastoralFlags()
    expect(flags.stage).toBe('off')
  })

  it('returns stage=admin-only when set', () => {
    process.env.NEXT_PUBLIC_PASTORAL_STAGE = 'admin-only'
    const flags = getPastoralFlags()
    expect(flags.stage).toBe('admin-only')
  })

  it('returns stage=internal when set', () => {
    process.env.NEXT_PUBLIC_PASTORAL_STAGE = 'internal'
    const flags = getPastoralFlags()
    expect(flags.stage).toBe('internal')
  })

  it('returns stage=public when set', () => {
    process.env.NEXT_PUBLIC_PASTORAL_STAGE = 'public'
    const flags = getPastoralFlags()
    expect(flags.stage).toBe('public')
  })

  it('returns stage=off for invalid stage values', () => {
    process.env.NEXT_PUBLIC_PASTORAL_STAGE = 'invalid-stage'
    const flags = getPastoralFlags()
    expect(flags.stage).toBe('off')
  })

  it('returns killSwitch=false by default', () => {
    const flags = getPastoralFlags()
    expect(flags.killSwitch).toBe(false)
  })

  it('returns killSwitch=true when set', () => {
    process.env.NEXT_PUBLIC_PASTORAL_KILL_SWITCH = 'on'
    const flags = getPastoralFlags()
    expect(flags.killSwitch).toBe(true)
  })

  it('returns minAppVersion=null when not set', () => {
    const flags = getPastoralFlags()
    expect(flags.minAppVersion).toBe(null)
  })

  it('returns minAppVersion when set', () => {
    process.env.NEXT_PUBLIC_PASTORAL_MIN_APP_VERSION = '1.0.0'
    const flags = getPastoralFlags()
    expect(flags.minAppVersion).toBe('1.0.0')
  })

  it('accepts custom env object', () => {
    const customEnv: NodeJS.ProcessEnv = {
      ...process.env,
      NEXT_PUBLIC_PASTORAL_ENABLED: 'on',
      NEXT_PUBLIC_PASTORAL_STAGE: 'internal',
      NEXT_PUBLIC_PASTORAL_KILL_SWITCH: 'on',
    }
    const flags = getPastoralFlags(customEnv)
    expect(flags.enabled).toBe(true)
    expect(flags.stage).toBe('internal')
    expect(flags.killSwitch).toBe(true)
  })
})

describe('isPastoralEnabled', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
    delete process.env.NEXT_PUBLIC_PASTORAL_ENABLED
    delete process.env.NEXT_PUBLIC_PASTORAL_STAGE
    delete process.env.NEXT_PUBLIC_PASTORAL_KILL_SWITCH
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns false when flag is off', () => {
    expect(isPastoralEnabled()).toBe(false)
  })

  it('returns false when enabled but stage is off', () => {
    process.env.NEXT_PUBLIC_PASTORAL_ENABLED = 'on'
    process.env.NEXT_PUBLIC_PASTORAL_STAGE = 'off'
    expect(isPastoralEnabled()).toBe(false)
  })

  it('returns true when enabled and stage is admin-only', () => {
    process.env.NEXT_PUBLIC_PASTORAL_ENABLED = 'on'
    process.env.NEXT_PUBLIC_PASTORAL_STAGE = 'admin-only'
    expect(isPastoralEnabled()).toBe(true)
  })

  it('returns true when enabled and stage is internal', () => {
    process.env.NEXT_PUBLIC_PASTORAL_ENABLED = 'on'
    process.env.NEXT_PUBLIC_PASTORAL_STAGE = 'internal'
    expect(isPastoralEnabled()).toBe(true)
  })

  it('returns true when enabled and stage is public', () => {
    process.env.NEXT_PUBLIC_PASTORAL_ENABLED = 'on'
    process.env.NEXT_PUBLIC_PASTORAL_STAGE = 'public'
    expect(isPastoralEnabled()).toBe(true)
  })

  it('returns false when killSwitch is on', () => {
    process.env.NEXT_PUBLIC_PASTORAL_ENABLED = 'on'
    process.env.NEXT_PUBLIC_PASTORAL_STAGE = 'public'
    process.env.NEXT_PUBLIC_PASTORAL_KILL_SWITCH = 'on'
    expect(isPastoralEnabled()).toBe(false)
  })
})

describe('getPastoralStage', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
    delete process.env.NEXT_PUBLIC_PASTORAL_STAGE
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns off by default', () => {
    expect(getPastoralStage()).toBe('off')
  })

  it('returns the configured stage', () => {
    process.env.NEXT_PUBLIC_PASTORAL_STAGE = 'public'
    expect(getPastoralStage()).toBe('public')
  })

  it('accepts custom env object', () => {
    const result = getPastoralStage({ ...process.env, NEXT_PUBLIC_PASTORAL_STAGE: 'internal' })
    expect(result).toBe('internal')
  })
})

describe('getPastoralStageGate', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
    delete process.env.NEXT_PUBLIC_PASTORAL_ENABLED
    delete process.env.NEXT_PUBLIC_PASTORAL_STAGE
    delete process.env.NEXT_PUBLIC_PASTORAL_KILL_SWITCH
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns false (gate closed) when pastoral is disabled', () => {
    expect(getPastoralStageGate()).toBe(false)
  })

  it('returns true (gate open) when pastoral is enabled and stage is public', () => {
    process.env.NEXT_PUBLIC_PASTORAL_ENABLED = 'on'
    process.env.NEXT_PUBLIC_PASTORAL_STAGE = 'public'
    expect(getPastoralStageGate()).toBe(true)
  })

  it('returns false when killSwitch is on regardless of stage', () => {
    process.env.NEXT_PUBLIC_PASTORAL_ENABLED = 'on'
    process.env.NEXT_PUBLIC_PASTORAL_STAGE = 'public'
    process.env.NEXT_PUBLIC_PASTORAL_KILL_SWITCH = 'on'
    expect(getPastoralStageGate()).toBe(false)
  })

  it('accepts custom env object', () => {
    const result = getPastoralStageGate({ ...process.env, NEXT_PUBLIC_PASTORAL_ENABLED: 'on', NEXT_PUBLIC_PASTORAL_STAGE: 'public', NEXT_PUBLIC_PASTORAL_KILL_SWITCH: '' })
    expect(result).toBe(true)
  })
})

describe('byte-identity of protected flags files (I-7)', () => {
  it('lib/platform/flags.ts is unchanged from main', () => {
    const diff = execSync(
      'git diff main...HEAD -- lib/platform/flags.ts',
      { encoding: 'utf-8', cwd: process.cwd() },
    )
    expect(diff.trim()).toBe('')
  })

  it('lib/platform/operating-core/flags.ts is unchanged from main', () => {
    const diff = execSync(
      'git diff main...HEAD -- lib/platform/operating-core/flags.ts',
      { encoding: 'utf-8', cwd: process.cwd() },
    )
    expect(diff.trim()).toBe('')
  })
})
