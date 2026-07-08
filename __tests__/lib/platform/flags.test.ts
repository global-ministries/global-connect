import { getDreamTeamFlags, type DreamTeamFlags } from '@/lib/platform/flags'

describe('lib/platform/flags', () => {
  describe('getDreamTeamFlags', () => {
    const originalEnv = process.env

    beforeEach(() => {
      jest.resetModules()
      process.env = { ...originalEnv }
    })

    afterAll(() => {
      process.env = originalEnv
    })

    it('returns disabled by default when no env vars are set', () => {
      delete process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED
      delete process.env.NEXT_PUBLIC_DREAM_TEAM_STAGE
      delete process.env.NEXT_PUBLIC_DREAM_TEAM_MIN_VERSION

      expect(getDreamTeamFlags()).toEqual({
        enabled: false,
        rolloutStage: 'off',
        minVersion: null,
      })
    })

    it('returns enabled when NEXT_PUBLIC_DREAM_TEAM_ENABLED is "true"', () => {
      process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
      process.env.NEXT_PUBLIC_DREAM_TEAM_STAGE = 'public'
      process.env.NEXT_PUBLIC_DREAM_TEAM_MIN_VERSION = '2.3.0'

      expect(getDreamTeamFlags()).toEqual({
        enabled: true,
        rolloutStage: 'public',
        minVersion: '2.3.0',
      })
    })

    it('defaults stage to "off" and minVersion to null', () => {
      process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'

      expect(getDreamTeamFlags()).toEqual({
        enabled: true,
        rolloutStage: 'off',
        minVersion: null,
      })
    })

    it('coerces invalid stage to "off"', () => {
      process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
      process.env.NEXT_PUBLIC_DREAM_TEAM_STAGE = 'invalid'

      expect(getDreamTeamFlags()).toEqual({
        enabled: true,
        rolloutStage: 'off',
        minVersion: null,
      })
    })

    it('accepts every valid rollout stage', () => {
      const stages: DreamTeamFlags['rolloutStage'][] = ['off', 'admin-only', 'internal', 'public']
      for (const stage of stages) {
        process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'true'
        process.env.NEXT_PUBLIC_DREAM_TEAM_STAGE = stage
        expect(getDreamTeamFlags().rolloutStage).toBe(stage)
      }
    })

    it('reads from a custom env object when provided', () => {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        NEXT_PUBLIC_DREAM_TEAM_ENABLED: 'true',
        NEXT_PUBLIC_DREAM_TEAM_STAGE: 'internal',
        NEXT_PUBLIC_DREAM_TEAM_MIN_VERSION: '2.2.5',
      }

      expect(getDreamTeamFlags(env)).toEqual({
        enabled: true,
        rolloutStage: 'internal',
        minVersion: '2.2.5',
      })
    })
  })
})
