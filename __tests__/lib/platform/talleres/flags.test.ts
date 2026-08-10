/**
 * PR1 — DT-004 — Talleres flags tests.
 * Verifies byte-identity of lib/platform/flags.ts and
 * lib/platform/operating-core/flags.ts (NOT edited).
 */

import { execSync } from 'child_process'
import { resolveMainRef } from '../../../../tests/helpers/git-ref'
import {
  getTalleresFlags,
  isTalleresEnabled,
  getTalleresStage,
  getTalleresStageGate,
  parseFlag,
  type TalleresRolloutStage,
} from '@/lib/platform/talleres/flags'

describe('parseFlag', () => {
  it('returns true for "true"', () => {
    expect(parseFlag('true')).toBe(true)
  })

  it('returns true for "on"', () => {
    expect(parseFlag('on')).toBe(true)
  })

  it('returns true for "1"', () => {
    expect(parseFlag('1')).toBe(true)
  })

  it('returns true for "yes"', () => {
    expect(parseFlag('yes')).toBe(true)
  })

  it('returns false for "false"', () => {
    expect(parseFlag('false')).toBe(false)
  })

  it('returns false for "off"', () => {
    expect(parseFlag('off')).toBe(false)
  })

  it('returns false for "0"', () => {
    expect(parseFlag('0')).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(parseFlag(undefined)).toBe(false)
  })

  it('returns false for null', () => {
    expect(parseFlag(null)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(parseFlag('')).toBe(false)
  })

  it('trims and lowercases input', () => {
    expect(parseFlag('  TRUE  ')).toBe(true)
    expect(parseFlag('  On  ')).toBe(true)
  })
})

describe('getTalleresFlags', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
    delete process.env.NEXT_PUBLIC_TALLERES_ENABLED
    delete process.env.NEXT_PUBLIC_TALLERES_STAGE
    delete process.env.NEXT_PUBLIC_TALLERES_KILL_SWITCH
    delete process.env.NEXT_PUBLIC_TALLERES_MIN_APP_VERSION
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns enabled=false when NEXT_PUBLIC_TALLERES_ENABLED is not set', () => {
    const flags = getTalleresFlags()
    expect(flags.enabled).toBe(false)
  })

  it('returns enabled=true when NEXT_PUBLIC_TALLERES_ENABLED is "on"', () => {
    process.env.NEXT_PUBLIC_TALLERES_ENABLED = 'on'
    const flags = getTalleresFlags()
    expect(flags.enabled).toBe(true)
  })

  it('returns enabled=false when NEXT_PUBLIC_TALLERES_ENABLED is "off"', () => {
    process.env.NEXT_PUBLIC_TALLERES_ENABLED = 'off'
    const flags = getTalleresFlags()
    expect(flags.enabled).toBe(false)
  })

  it('returns stage=off by default', () => {
    const flags = getTalleresFlags()
    expect(flags.stage).toBe('off')
  })

  it('returns stage from env when set', () => {
    process.env.NEXT_PUBLIC_TALLERES_STAGE = 'internal'
    const flags = getTalleresFlags()
    expect(flags.stage).toBe('internal')
  })

  it('returns killSwitch=false when not set', () => {
    const flags = getTalleresFlags()
    expect(flags.killSwitch).toBe(false)
  })

  it('returns killSwitch=true when set to "on"', () => {
    process.env.NEXT_PUBLIC_TALLERES_KILL_SWITCH = 'on'
    const flags = getTalleresFlags()
    expect(flags.killSwitch).toBe(true)
  })

  it('returns minAppVersion when set', () => {
    process.env.NEXT_PUBLIC_TALLERES_MIN_APP_VERSION = '1.0.0'
    const flags = getTalleresFlags()
    expect(flags.minAppVersion).toBe('1.0.0')
  })

  it('returns null minAppVersion when not set', () => {
    const flags = getTalleresFlags()
    expect(flags.minAppVersion).toBeNull()
  })

  it('returns all stages as valid', () => {
    const stages: TalleresRolloutStage[] = ['off', 'admin-only', 'internal', 'public']
    for (const stage of stages) {
      process.env.NEXT_PUBLIC_TALLERES_ENABLED = 'true'
      process.env.NEXT_PUBLIC_TALLERES_STAGE = stage
      const flags = getTalleresFlags()
      expect(flags.stage).toBe(stage)
    }
  })
})

describe('isTalleresEnabled', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
    delete process.env.NEXT_PUBLIC_TALLERES_ENABLED
    delete process.env.NEXT_PUBLIC_TALLERES_STAGE
    delete process.env.NEXT_PUBLIC_TALLERES_KILL_SWITCH
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns true when enabled, stage not off, and no killSwitch', () => {
    process.env.NEXT_PUBLIC_TALLERES_ENABLED = 'true'
    process.env.NEXT_PUBLIC_TALLERES_STAGE = 'public'
    process.env.NEXT_PUBLIC_TALLERES_KILL_SWITCH = 'false'
    const result = isTalleresEnabled()
    expect(result).toBe(true)
  })

  it('returns false when enabled but stage is off', () => {
    process.env.NEXT_PUBLIC_TALLERES_ENABLED = 'true'
    process.env.NEXT_PUBLIC_TALLERES_STAGE = 'off'
    process.env.NEXT_PUBLIC_TALLERES_KILL_SWITCH = 'false'
    const result = isTalleresEnabled()
    expect(result).toBe(false)
  })

  it('returns false when enabled but killSwitch is on', () => {
    process.env.NEXT_PUBLIC_TALLERES_ENABLED = 'true'
    process.env.NEXT_PUBLIC_TALLERES_STAGE = 'public'
    process.env.NEXT_PUBLIC_TALLERES_KILL_SWITCH = 'true'
    const result = isTalleresEnabled()
    expect(result).toBe(false)
  })

  it('returns false when not enabled', () => {
    process.env.NEXT_PUBLIC_TALLERES_ENABLED = 'false'
    const result = isTalleresEnabled()
    expect(result).toBe(false)
  })
})

describe('getTalleresStage', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
    delete process.env.NEXT_PUBLIC_TALLERES_ENABLED
    delete process.env.NEXT_PUBLIC_TALLERES_STAGE
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns the current stage', () => {
    process.env.NEXT_PUBLIC_TALLERES_ENABLED = 'true'
    process.env.NEXT_PUBLIC_TALLERES_STAGE = 'internal'
    const stage = getTalleresStage()
    expect(stage).toBe('internal')
  })
})

describe('getTalleresStageGate', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
    delete process.env.NEXT_PUBLIC_TALLERES_ENABLED
    delete process.env.NEXT_PUBLIC_TALLERES_STAGE
    delete process.env.NEXT_PUBLIC_TALLERES_KILL_SWITCH
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns true when enabled, stage=public, and no killSwitch', () => {
    process.env.NEXT_PUBLIC_TALLERES_ENABLED = 'true'
    process.env.NEXT_PUBLIC_TALLERES_STAGE = 'public'
    process.env.NEXT_PUBLIC_TALLERES_KILL_SWITCH = 'false'
    const result = getTalleresStageGate()
    expect(result).toBe(true)
  })

  it('returns false when stage is not public', () => {
    process.env.NEXT_PUBLIC_TALLERES_ENABLED = 'true'
    process.env.NEXT_PUBLIC_TALLERES_STAGE = 'internal'
    process.env.NEXT_PUBLIC_TALLERES_KILL_SWITCH = 'false'
    const result = getTalleresStageGate()
    expect(result).toBe(false)
  })
})

describe('byte-identity of protected flags files (I-7)', () => {
  it('lib/platform/flags.ts is unchanged from main', () => {
    const diff = execSync(
      `git diff ${resolveMainRef()}..HEAD -- lib/platform/flags.ts`,
      { encoding: 'utf-8', cwd: process.cwd() },
    )
    expect(diff.trim()).toBe('')
  })

  it('lib/platform/operating-core/flags.ts is unchanged from main', () => {
    const diff = execSync(
      `git diff ${resolveMainRef()}..HEAD -- lib/platform/operating-core/flags.ts`,
      { encoding: 'utf-8', cwd: process.cwd() },
    )
    expect(diff.trim()).toBe('')
  })
})
