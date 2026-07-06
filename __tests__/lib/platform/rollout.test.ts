import {
  checkPlatformRolloutGate,
  PLATFORM_ROLLOUT_GATES,
  PLATFORM_ROLLOUT_PLAN,
  PLATFORM_ROLLOUT_PR_GATES,
  type PlatformRolloutGate,
} from '@/lib/platform/rollout'

describe('lib/platform/rollout', () => {
  describe('PR gates', () => {
    it('exports the five canonical gate keys', () => {
      expect(PLATFORM_ROLLOUT_PR_GATES).toEqual(['tests', 'build', 'typecheck', 'bundle_size', 'review'])
    })

    it('defines a description and required flag for every gate', () => {
      for (const gate of PLATFORM_ROLLOUT_GATES) {
        expect(gate.description.length).toBeGreaterThan(0)
        expect(typeof gate.required).toBe('boolean')
      }
      expect(PLATFORM_ROLLOUT_GATES.filter((g) => g.required).map((g) => g.key)).toEqual([
        'tests',
        'build',
        'typecheck',
        'review',
      ])
      expect(PLATFORM_ROLLOUT_GATES.find((g) => g.key === 'bundle_size')?.required).toBe(false)
    })
  })

  describe('checkPlatformRolloutGate', () => {
    const requiredGate: PlatformRolloutGate = { key: 'tests', description: 'Test gate', required: true }
    const optionalGate: PlatformRolloutGate = {
      key: 'bundle_size',
      description: 'Bundle gate',
      required: false,
    }

    it('passes a satisfied required gate with no reason', () => {
      expect(checkPlatformRolloutGate(requiredGate, true)).toEqual({
        gateKey: 'tests',
        passed: true,
        reason: undefined,
      })
    })

    it('fails a required gate with a reason when not satisfied', () => {
      const result = checkPlatformRolloutGate(requiredGate, false)
      expect(result.passed).toBe(false)
      expect(result.reason).toMatch(/tests.*required/)
    })

    it('passes an optional gate regardless of satisfaction', () => {
      expect(checkPlatformRolloutGate(optionalGate, true)).toEqual({
        gateKey: 'bundle_size',
        passed: true,
        reason: undefined,
      })
      expect(checkPlatformRolloutGate(optionalGate, false)).toEqual({
        gateKey: 'bundle_size',
        passed: true,
        reason: undefined,
      })
    })

    it('generalizes the failure reason to any required gate key', () => {
      const buildGate: PlatformRolloutGate = { key: 'build', description: 'Build gate', required: true }
      const result = checkPlatformRolloutGate(buildGate, false)
      expect(result).toEqual({
        gateKey: 'build',
        passed: false,
        reason: 'build gate is required for rollout: Build gate',
      })
    })
  })

  describe('rollout plan', () => {
    it('has five monotonically increasing stages', () => {
      const percentages = PLATFORM_ROLLOUT_PLAN.stages.map((s) => s.percentage)
      expect(percentages).toEqual([0, 5, 25, 50, 100])
      for (let i = 1; i < percentages.length; i++) {
        expect(percentages[i]).toBeGreaterThan(percentages[i - 1])
      }
    })

    it('defines a rollback path with immediate actions and a description', () => {
      expect(PLATFORM_ROLLOUT_PLAN.rollbackPath.immediate.length).toBeGreaterThan(0)
      expect(PLATFORM_ROLLOUT_PLAN.rollbackPath.description.length).toBeGreaterThan(0)
    })
  })
})
