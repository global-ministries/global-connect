/**
 * PR13 — DT-049 — Taller mentor adapter tests.
 *
 * Exercises the canonical Fase 5 path (inscripciones → cohortes → grupos →
 * lideres) + the Fase 2 fallback (dream_team_servicios). The F4
 * mentor-cascade.ts consumer only mocks this adapter; these tests
 * pin the real resolver behavior.
 */

import fs from 'node:fs'
import path from 'node:path'

import {
  resolverLiderDeTallerFase2,
  resolverLiderDeTallerFase5,
} from '@/lib/platform/pastoral/adapters/grupo-corto-plazo-supabase-adapter'

const ADAPTER_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../../../../lib/platform/pastoral/adapters/grupo-corto-plazo-supabase-adapter.ts'),
  'utf-8',
)

// ── Supabase chainable fake ─────────────────────────────────────────────
//
// One helper: `fakeClient(perTable)` where `perTable` is a map from
// table name → array of rows. Each call to `from(table).select(...).eq(...).in(...)`
// returns the rows for that table, recording filters for inspection.

function fakeClient(perTable: Record<string, unknown[]>): any {
  return {
    from(table: string) {
      const builder: any = {
        _table: table,
        _rows: perTable[table] ?? [],
        select(_cols?: string) { return builder },
        eq() { return builder },
        in() { return builder },
        or() { return builder },
        limit() { return builder },
        match() { return builder },
        order() { return builder },
        gte() { return builder },
        lte() { return builder },
        then(resolve: (r: { data: unknown[]; error: null }) => void) {
          resolve({ data: builder._rows, error: null })
          return Promise.resolve()
        },
      }
      return builder
    },
  }
}

// Variant: take an ordered list of (table, rows) pairs and return
// each in turn (for tests where the same table is called multiple times
// with different filters returning different data).
function fakeClientSequence(steps: Array<[string, unknown[]]>): any {
  let i = 0
  return {
    from(table: string) {
      const stepIndex = Math.min(i++, steps.length - 1)
      const [expectedTable, rows] = steps[stepIndex] ?? [table, []]
      const builder: any = {
        _table: table,
        _rows: table === expectedTable ? rows : [],
        select(_cols?: string) { return builder },
        eq() { return builder },
        in() { return builder },
        or() { return builder },
        limit() { return builder },
        match() { return builder },
        order() { return builder },
        gte() { return builder },
        lte() { return builder },
        then(resolve: (r: { data: unknown[]; error: null }) => void) {
          resolve({ data: builder._rows, error: null })
          return Promise.resolve()
        },
      }
      return builder
    },
  }
}

describe('resolverLiderDeTallerFase5', () => {
  it('returns null on empty personaId', async () => {
    expect(await resolverLiderDeTallerFase5(fakeClient({}), '')).toBeNull()
    expect(await resolverLiderDeTallerFase5(fakeClient({}), '   ')).toBeNull()
  })

  it('returns null when no inscripciones found', async () => {
    const fake = fakeClient({ taller_inscripciones: [] })
    expect(await resolverLiderDeTallerFase5(fake, 'p-1')).toBeNull()
  })

  it('returns null when inscripcion has no cohorte_id', async () => {
    const fake = fakeClient({
      taller_inscripciones: [{ id: 'i1', taller_id: 't1', cohorte_id: null }],
    })
    expect(await resolverLiderDeTallerFase5(fake, 'p-1')).toBeNull()
  })

  it('returns null when cohorte has no grupos', async () => {
    const fake = fakeClient({
      taller_inscripciones: [{ id: 'i1', taller_id: 't1', cohorte_id: 'c-1' }],
      taller_grupos: [],
      taller_grupo_asignaciones: [],
    })
    expect(await resolverLiderDeTallerFase5(fake, 'p-1')).toBeNull()
  })

  it('returns the first non-self lider of the first grupo', async () => {
    const fake = fakeClient({
      taller_inscripciones: [{ id: 'i1', taller_id: 't1', cohorte_id: 'c-1' }],
      taller_grupos: [{ id: 'g-1' }],
      taller_grupo_asignaciones: [{ persona_id: 'lider-1' }],
    })
    expect(await resolverLiderDeTallerFase5(fake, 'p-1')).toBe('lider-1')
  })

  it('skips self-lider and returns the next lider', async () => {
    // Two grupos; first one's lider IS the persona → skip; second grupo's
    // lider is a different persona → return that.
    const fake = fakeClientSequence([
      ['taller_inscripciones', [{ id: 'i1', taller_id: 't1', cohorte_id: 'c-1' }]],
      ['taller_grupos', [{ id: 'g-1' }, { id: 'g-2' }]],
      ['taller_grupo_asignaciones', [{ persona_id: 'p-1' }]],   // g-1 self-lider → skip
      ['taller_grupo_asignaciones', [{ persona_id: 'lider-2' }]], // g-2 → return
    ])
    expect(await resolverLiderDeTallerFase5(fake, 'p-1')).toBe('lider-2')
  })
})

describe('resolverLiderDeTallerFase2 (fallback)', () => {
  it('returns null when no active servicios match', async () => {
    const fake = fakeClient({
      dream_team_servicios: [],
      dream_team_roles: [],
    })
    expect(await resolverLiderDeTallerFase2(fake, 'p-1')).toBeNull()
  })

  it('returns the líder persona when found, excluding self', async () => {
    const fake = fakeClientSequence([
      ['dream_team_servicios', [{ equipo_id: 'eq-1', rol_id: 'rol-1' }]],
      ['dream_team_roles', [{ id: 'rol-1' }]],
      ['dream_team_servicios', [{ persona_id: 'lider-1' }]],
    ])
    expect(await resolverLiderDeTallerFase2(fake, 'p-1')).toBe('lider-1')
  })

  it('returns null when the only lider IS the persona (self-mentor guard)', async () => {
    const fake = fakeClientSequence([
      ['dream_team_servicios', [{ equipo_id: 'eq-1', rol_id: 'rol-1' }]],
      ['dream_team_roles', [{ id: 'rol-1' }]],
      ['dream_team_servicios', [{ persona_id: 'p-1' }]], // self
    ])
    expect(await resolverLiderDeTallerFase2(fake, 'p-1')).toBeNull()
  })
})

describe('I-6 — adapter is read-only', () => {
  it('never calls INSERT/UPDATE/DELETE on any table', () => {
    // Source-level grep: the adapter file should not contain write verbs.
    // Read via static fs/path imports at the top of the file.
    const src = ADAPTER_SOURCE
    expect(src).not.toMatch(/\.insert\(/)
    expect(src).not.toMatch(/\.update\(/)
    expect(src).not.toMatch(/\.delete\(/)
  })
})
