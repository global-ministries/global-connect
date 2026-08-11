/**
 * PR11 — DT-045 — Talleres recurrence tests + I-6 additive invariant.
 *
 * Pure unit tests covering R1 (manual wins), R2 (reschedule only when
 * pendiente), and the permanent-custom stub.
 */

import fs from 'node:fs'
import path from 'node:path'

import {
  computePeriodClose,
  nextPermanentCustomOccurrence,
  shouldRescheduleOnStart,
} from '@/lib/platform/talleres/recurrence'

const MIGRATION = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260811140000_talleres_period_closer.sql',
)

describe('computePeriodClose (R1 manual-wins)', () => {
  it('returns manual close when present, ignoring automatic', () => {
    expect(
      computePeriodClose('taller-1', '2026-07-01', '2026-09-01', '2026-07-15', '2026-08-01'),
    ).toEqual({ taller_id: 'taller-1', fecha_cierre_real: '2026-08-01', source: 'manual' })
  })

  it('falls back to automatic when manual is null', () => {
    expect(
      computePeriodClose('taller-2', '2026-07-01', '2026-09-01', '2026-07-15', null),
    ).toEqual({ taller_id: 'taller-2', fecha_cierre_real: '2026-09-01', source: 'automatic' })
  })

  it('returns source=pending when both are null', () => {
    expect(
      computePeriodClose('taller-3', null, null, null, null),
    ).toEqual({ taller_id: 'taller-3', fecha_cierre_real: null, source: 'pending' })
  })

  it('uses automatic when manual=null and automatic is set (regardless of apertura_manual)', () => {
    expect(
      computePeriodClose('taller-4', '2026-07-01', '2026-09-01', '2026-07-15', null),
    ).toEqual({ taller_id: 'taller-4', fecha_cierre_real: '2026-09-01', source: 'automatic' })
  })
})

describe('nextPermanentCustomOccurrence (stub v1)', () => {
  it('DAILY with INTERVAL=1 returns the next day', () => {
    expect(
      nextPermanentCustomOccurrence({ freq: 'DAILY', interval: 1 }, '2026-08-01'),
    ).toBe('2026-08-02')
  })

  it('DAILY with INTERVAL=7 returns a week later', () => {
    expect(
      nextPermanentCustomOccurrence({ freq: 'DAILY', interval: 7 }, '2026-08-01'),
    ).toBe('2026-08-08')
  })

  it('WEEKLY with BYDAY=MO returns the next Monday', () => {
    expect(
      nextPermanentCustomOccurrence(
        { freq: 'WEEKLY', interval: 1, byday: ['MO'] },
        '2026-08-05', // Wednesday
      ),
    ).toBe('2026-08-10') // next Monday
  })

  it('returns null when rule is null', () => {
    expect(nextPermanentCustomOccurrence(null, '2026-08-01')).toBeNull()
  })

  it('returns null for unsupported FREQ (YEARLY)', () => {
    expect(
      nextPermanentCustomOccurrence({ freq: 'YEARLY', interval: 1 }, '2026-08-01'),
    ).toBeNull()
  })
})

describe('shouldRescheduleOnStart (R2)', () => {
  it('true only when inscripcion pendiente AND taller en_curso', () => {
    expect(shouldRescheduleOnStart('pendiente', 'en_curso')).toBe(true)
  })

  it('false when inscripcion already approved', () => {
    expect(shouldRescheduleOnStart('aprobado', 'en_curso')).toBe(false)
    expect(shouldRescheduleOnStart('no_aprobado', 'en_curso')).toBe(false)
  })

  it('false when taller not en_curso', () => {
    expect(shouldRescheduleOnStart('pendiente', 'borrador')).toBe(false)
    expect(shouldRescheduleOnStart('pendiente', 'cerrado')).toBe(false)
    expect(shouldRescheduleOnStart('pendiente', 'cancelado')).toBe(false)
  })
})

describe('I-6 additive invariant — migration contains no destructive DDL', () => {
  it('grep for forbidden patterns returns 0 hits', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf-8')
    const noComments = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
    const forbiddenPatterns: Array<[string, RegExp]> = [
      ['DROP TABLE', /\bDROP\s+TABLE\b/i],
      ['DROP COLUMN', /\bDROP\s+COLUMN\b/i],
      ['DROP CONSTRAINT', /\bDROP\s+CONSTRAINT\b/i],
      ['DROP POLICY', /\bDROP\s+POLICY\b/i],
      ['DROP INDEX', /\bDROP\s+INDEX\b/i],
      ['DELETE FROM', /\bDELETE\s+FROM\b/i],
      ['TRUNCATE', /\bTRUNCATE\b/i],
      ['ALTER COLUMN ... TYPE', /ALTER\s+COLUMN\s+\w+\s+TYPE\b/i],
    ]
    for (const [label, re] of forbiddenPatterns) {
      expect({ label, hit: re.test(noComments) }).toEqual({ label, hit: false })
    }
  })

  it('declares the helper function taller_emit_overdue_event', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf-8')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.taller_emit_overdue_event')
  })

  it('guards pg_cron setup behind extension presence check', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf-8')
    expect(sql).toContain("SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'")
  })
})
