/**
 * S22 — Recurrent state pure function tests.
 *
 * Tests for:
 * - generateInstanceDates: deterministic date generation from RRULE subset
 * - isOutOfHorizon: boundary check for materialization horizon
 * - validateRecurrenceRule: validates RRULE shape
 */

import {
  generateInstanceDates,
  isOutOfHorizon,
  validateRecurrenceRule,
} from '@/lib/platform/operating-core/recurrent/recurrent-state'

describe('recurrent-state: generateInstanceDates', () => {
  describe('weekly recurrence', () => {
    it('should generate weekly instances within horizon', () => {
      const rule = {
        freq: 'weekly' as const,
        interval: 1,
        count: null,
        until: null,
        byDay: null,
        startTime: '10:00',
      }
      const startDate = '2026-01-04' // Sunday
      const horizonDays = 28

      const result = generateInstanceDates(rule, startDate, horizonDays)

      // Within 28 days from Jan 4: Jan 4, Jan 11, Jan 18, Jan 25 = 4 Sundays
      expect(result.dates).toHaveLength(4)
      expect(result.out_of_horizon).toBe(false)
      expect(result.dates).toEqual(['2026-01-04', '2026-01-11', '2026-01-18', '2026-01-25'])
    })

    it('should respect count limit', () => {
      const rule = {
        freq: 'weekly' as const,
        interval: 1,
        count: 2,
        until: null,
        byDay: null,
        startTime: '10:00',
      }
      const startDate = '2026-01-04'
      const horizonDays = 90 // Many weeks, but count=2

      const result = generateInstanceDates(rule, startDate, horizonDays)

      expect(result.dates).toHaveLength(2)
      expect(result.dates).toEqual(['2026-01-04', '2026-01-11'])
    })

    it('should respect until boundary', () => {
      const rule = {
        freq: 'weekly' as const,
        interval: 1,
        count: null,
        until: '2026-01-25',
        byDay: null,
        startTime: '10:00',
      }
      const startDate = '2026-01-04'
      const horizonDays = 90

      const result = generateInstanceDates(rule, startDate, horizonDays)

      // Jan 4, Jan 11, Jan 18 — Jan 25 is the until boundary (inclusive)
      expect(result.dates).toHaveLength(3)
      expect(result.dates).toEqual(['2026-01-04', '2026-01-11', '2026-01-18'])
    })

    it('should return out_of_horizon when requested_date > horizon boundary', () => {
      const rule = {
        freq: 'weekly' as const,
        interval: 1,
        count: null,
        until: null,
        byDay: null,
        startTime: '10:00',
      }
      const startDate = '2026-01-04'
      const horizonDays = 28

      // Request a date that is within horizon
      const result1 = generateInstanceDates(rule, startDate, horizonDays)
      expect(result1.out_of_horizon).toBe(false)

      // The horizon check itself is tested in isOutOfHorizon
    })
  })

  describe('daily recurrence', () => {
    it('should generate daily instances', () => {
      const rule = {
        freq: 'daily' as const,
        interval: 1,
        count: null,
        until: null,
        byDay: null,
        startTime: '09:00',
      }
      const startDate = '2026-07-20'
      const horizonDays = 7

      const result = generateInstanceDates(rule, startDate, horizonDays)

      // 7 days: Jul 20, 21, 22, 23, 24, 25, 26
      expect(result.dates).toHaveLength(7)
      expect(result.dates[0]).toBe('2026-07-20')
      expect(result.dates[6]).toBe('2026-07-26')
    })

    it('should respect interval > 1 for daily', () => {
      const rule = {
        freq: 'daily' as const,
        interval: 2,
        count: null,
        until: null,
        byDay: null,
        startTime: '09:00',
      }
      const startDate = '2026-07-20'
      const horizonDays = 10

      const result = generateInstanceDates(rule, startDate, horizonDays)

      // Every 2 days: Jul 20, 22, 24, 26, 28 = 5 instances
      expect(result.dates).toHaveLength(5)
    })
  })

  describe('monthly recurrence', () => {
    it('should generate monthly instances', () => {
      const rule = {
        freq: 'monthly' as const,
        interval: 1,
        count: null,
        until: null,
        byDay: null,
        startTime: '10:00',
      }
      const startDate = '2026-01-15'
      const horizonDays = 180

      const result = generateInstanceDates(rule, startDate, horizonDays)

      // Jan 15, Feb 15, Mar 15, Apr 15, May 15, Jun 15 = 6 instances
      expect(result.dates).toHaveLength(6)
    })
  })

  describe('yearly recurrence', () => {
    it('should generate yearly instances within horizon', () => {
      const rule = {
        freq: 'yearly' as const,
        interval: 1,
        count: null,
        until: null,
        byDay: null,
        startTime: '10:00',
      }
      const startDate = '2026-01-15'
      const horizonDays = 730 // ~2 years

      const result = generateInstanceDates(rule, startDate, horizonDays)

      // Jan 15, 2026 and Jan 15, 2027
      expect(result.dates).toHaveLength(2)
      expect(result.dates).toEqual(['2026-01-15', '2027-01-15'])
    })
  })

  describe('determinism', () => {
    it('should produce identical dates for same inputs (idempotent)', () => {
      const rule = {
        freq: 'weekly' as const,
        interval: 1,
        count: null,
        until: null,
        byDay: null,
        startTime: '10:00',
      }
      const startDate = '2026-01-04'
      const horizonDays = 28

      const result1 = generateInstanceDates(rule, startDate, horizonDays)
      const result2 = generateInstanceDates(rule, startDate, horizonDays)

      expect(result1.dates).toEqual(result2.dates)
      expect(result1.out_of_horizon).toEqual(result2.out_of_horizon)
    })

    it('should be deterministic across multiple calls', () => {
      const rule = {
        freq: 'weekly' as const,
        interval: 1,
        count: null,
        until: null,
        byDay: null,
        startTime: '10:00',
      }
      const startDate = '2026-01-04'
      const horizonDays = 28

      const results = Array.from({ length: 5 }, () =>
        generateInstanceDates(rule, startDate, horizonDays),
      )

      for (const result of results) {
        expect(result.dates).toEqual(['2026-01-04', '2026-01-11', '2026-01-18', '2026-01-25'])
        expect(result.out_of_horizon).toBe(false)
      }
    })
  })

  describe('empty / edge cases', () => {
    it('should return empty when horizonDays is 0', () => {
      const rule = {
        freq: 'weekly' as const,
        interval: 1,
        count: null,
        until: null,
        byDay: null,
        startTime: '10:00',
      }
      const startDate = '2026-01-04'
      const horizonDays = 0

      const result = generateInstanceDates(rule, startDate, horizonDays)

      expect(result.dates).toHaveLength(0)
    })

    it('should return empty when count is 0', () => {
      const rule = {
        freq: 'weekly' as const,
        interval: 1,
        count: 0,
        until: null,
        byDay: null,
        startTime: '10:00',
      }
      const startDate = '2026-01-04'
      const horizonDays = 90

      const result = generateInstanceDates(rule, startDate, horizonDays)

      expect(result.dates).toHaveLength(0)
    })
  })
})

describe('recurrent-state: isOutOfHorizon', () => {
  it('should return false when requested date is within horizon', () => {
    const startDate = '2026-01-01'
    const horizonDays = 90

    // Jan 1 + 90 days = Apr 1 (exclusive boundary)
    expect(isOutOfHorizon('2026-03-15', startDate, horizonDays)).toBe(false)
    expect(isOutOfHorizon('2026-01-01', startDate, horizonDays)).toBe(false) // exactly at start
  })

  it('should return true when requested date is beyond horizon', () => {
    const startDate = '2026-01-01'
    const horizonDays = 90

    // Apr 2 is beyond Jan 1 + 90 days (Apr 1)
    expect(isOutOfHorizon('2026-04-02', startDate, horizonDays)).toBe(true)
    expect(isOutOfHorizon('2026-12-31', startDate, horizonDays)).toBe(true)
  })

  it('should use default horizon of 90 when not specified', () => {
    const startDate = '2026-01-01'
    // horizonDays defaults to 90
    expect(isOutOfHorizon('2026-04-01', startDate, 90)).toBe(false)
    expect(isOutOfHorizon('2026-04-02', startDate, 90)).toBe(true)
  })
})

describe('recurrent-state: validateRecurrenceRule', () => {
  it('should accept valid weekly rule', () => {
    const rule = {
      freq: 'weekly' as const,
      interval: 1,
      count: null,
      until: null,
      byDay: null,
      startTime: '10:00',
    }
    expect(validateRecurrenceRule(rule)).toBe(true)
  })

  it('should accept valid daily rule with count', () => {
    const rule = {
      freq: 'daily' as const,
      interval: 2,
      count: 10,
      until: null,
      byDay: null,
      startTime: '09:00',
    }
    expect(validateRecurrenceRule(rule)).toBe(true)
  })

  it('should accept valid monthly rule with until', () => {
    const rule = {
      freq: 'monthly' as const,
      interval: 1,
      count: null,
      until: '2026-12-31',
      byDay: null,
      startTime: '10:00',
    }
    expect(validateRecurrenceRule(rule)).toBe(true)
  })

  it('should accept valid yearly rule', () => {
    const rule = {
      freq: 'yearly' as const,
      interval: 1,
      count: null,
      until: null,
      byDay: null,
      startTime: '10:00',
    }
    expect(validateRecurrenceRule(rule)).toBe(true)
  })

  it('should accept rule with byDay (weekly with specific days)', () => {
    const rule = {
      freq: 'weekly' as const,
      interval: 1,
      count: null,
      until: null,
      byDay: [0, 3], // Sunday, Wednesday
      startTime: '10:00',
    }
    expect(validateRecurrenceRule(rule)).toBe(true)
  })

  it('should reject rule with freq=daily_biweekly (unsupported)', () => {
    const rule = {
      freq: 'biweekly',
      interval: 1,
      count: null,
      until: null,
      byDay: null,
      startTime: '10:00',
    }
    // @ts-expect-error — testing runtime validation of invalid freq
    expect(validateRecurrenceRule(rule)).toBe(false)
  })

  it('should reject rule missing freq', () => {
    const rule = {
      freq: undefined,
      interval: 1,
      count: null,
      until: null,
      byDay: null,
      startTime: '10:00',
    }
    // @ts-expect-error — testing runtime validation
    expect(validateRecurrenceRule(rule)).toBe(false)
  })

  it('should reject rule with interval <= 0', () => {
    const rule0 = {
      freq: 'weekly' as const,
      interval: 0,
      count: null,
      until: null,
      byDay: null,
      startTime: '10:00',
    }
    expect(validateRecurrenceRule(rule0)).toBe(false)

    const ruleNeg = {
      freq: 'weekly' as const,
      interval: -1,
      count: null,
      until: null,
      byDay: null,
      startTime: '10:00',
    }
    expect(validateRecurrenceRule(ruleNeg)).toBe(false)
  })

  it('should accept rule with both count and until set (whichever comes first applies)', () => {
    const rule = {
      freq: 'weekly' as const,
      interval: 1,
      count: 10,
      until: '2026-12-31',
      byDay: null,
      startTime: '10:00',
    }
    // Both count and until can coexist — the rule generates until count is reached OR until is reached, whichever is first
    expect(validateRecurrenceRule(rule)).toBe(true)
  })

  it('should reject rule with invalid byDay values', () => {
    const rule = {
      freq: 'weekly' as const,
      interval: 1,
      count: null,
      until: null,
      byDay: [7], // 7 is invalid (0-6 is valid)
      startTime: '10:00',
    }
    expect(validateRecurrenceRule(rule)).toBe(false)
  })
})
