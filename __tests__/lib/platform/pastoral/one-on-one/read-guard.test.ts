/**
 * W05 — DT-029 — Pastoral 1:1 read guard tests.
 * F(pastoral/one-on-one/read-guard)
 *
 * Covers ESC-01/02/03/04/05/06 from pastoral-one-on-one-read spec.
 * T2: notes never in roadmap (P6 public view).
 */
import {
  canReadPastoralOneOnOne,
  projectToRoadmap,
  filterNotesForActor,
  type PastoralOneOnOneReadActor,
  type PastoralOneOnOneReadResult,
} from '@/lib/platform/pastoral/one-on-one/read-guard'

// Type assertion helper for tests — narrows the union after checking allowed
function assertAllowed(r: PastoralOneOnOneReadResult): asserts r is PastoralOneOnOneReadResult & { allowed: true } {
  if (!r.allowed) throw new Error('Expected allowed=true but got ' + r.reason)
}
function assertDenied(r: PastoralOneOnOneReadResult): asserts r is PastoralOneOnOneReadResult & { allowed: false } {
  if (r.allowed) throw new Error('Expected allowed=false but got allowed=true')
}
import type { PastoralOneOnOne, PastoralOneOnOneNota } from '@/lib/platform/pastoral/types'

const MENTOR_ID = '00000000-0000-0000-0000-000000000001'
const PARTICIPANT_ID = '00000000-0000-0000-0000-000000000002'
const OTHER_ID = '00000000-0000-0000-0000-000000000003'

function makeOneOnOne(overrides: Partial<PastoralOneOnOne> = {}): PastoralOneOnOne {
  return {
    id: 'ooo-1',
    mentorOficialPersonaId: MENTOR_ID,
    autorPersonaId: MENTOR_ID,
    estado: 'scheduled',
    scheduledAt: '2026-08-01T10:00:00.000Z',
    completedAt: null,
    motivoCancelacion: null,
    resumen: 'private summary — should not be in roadmap',
    motivoNoRealizado: null,
    version: 1,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  }
}

function makeActor(personaId: string, capabilities: string[] = []): PastoralOneOnOneReadActor {
  return {
    personaId,
    capabilities: capabilities.map((key) => ({ key })),
  }
}

function participantes(personaIds: string[]) {
  return personaIds.map((personaId) => ({ personaId }))
}

describe('canReadPastoralOneOnOne — three circles (P6)', () => {
  // ESC-01: actor is mentor autor → full read
  describe('ESC-01: mentor autor', () => {
    it('allows full read when actor is mentorOficialPersonaId', () => {
      const actor = makeActor(MENTOR_ID)
      const ooo = makeOneOnOne()
      const result = canReadPastoralOneOnOne(actor, ooo, [])
      expect(result.allowed).toBe(true)
      const r = result as { allowed: true; mode: string; actor: typeof actor }
      expect(r.mode).toBe('full')
    })

    it('full read even without pastoral.read.all capability', () => {
      const actor = makeActor(MENTOR_ID, [])
      const ooo = makeOneOnOne()
      const result = canReadPastoralOneOnOne(actor, ooo, [])
      expect(result.allowed).toBe(true)
      const r = result as { allowed: true; mode: string; actor: typeof actor }
      expect(r.mode).toBe('full')
    })
  })

  // ESC-02: actor has pastoral.read.all capability → full read
  describe('ESC-02: pastoral.read.all capability', () => {
    it('allows full read when actor has pastoral.read.all', () => {
      const actor = makeActor(OTHER_ID, ['pastoral.read.all'])
      const ooo = makeOneOnOne()
      const result = canReadPastoralOneOnOne(actor, ooo, [])
      assertAllowed(result)
      expect(result.mode).toBe('full')
    })

    it('full read even when actor is neither mentor nor participant', () => {
      const actor = makeActor(OTHER_ID, ['pastoral.read.all'])
      const ooo = makeOneOnOne()
      const result = canReadPastoralOneOnOne(actor, ooo, [])
      assertAllowed(result)
      expect(result.mode).toBe('full')
    })
  })

  // ESC-03: actor is participated person (P6) → roadmap only
  describe('ESC-03: participated person (P6) — roadmap only', () => {
    it('allows roadmap read when actor is in participantes list', () => {
      const actor = makeActor(PARTICIPANT_ID)
      const ooo = makeOneOnOne()
      const result = canReadPastoralOneOnOne(actor, ooo, participantes([PARTICIPANT_ID]))
      assertAllowed(result)
      expect(result.mode).toBe('roadmap')
    })

    it('denies full read for participated person (P6)', () => {
      const actor = makeActor(PARTICIPANT_ID)
      const ooo = makeOneOnOne()
      const result = canReadPastoralOneOnOne(actor, ooo, participantes([PARTICIPANT_ID]))
      assertAllowed(result)
      expect(result.mode).toBe('roadmap')
      expect(result.mode).not.toBe('full')
    })

    it('roadmap read works for participated person who is also mentor', () => {
      // Edge case: participated person is the mentor themselves
      const actor = makeActor(MENTOR_ID)
      const ooo = makeOneOnOne()
      // Mentor is NOT in participantes list (only participant)
      const result = canReadPastoralOneOnOne(actor, ooo, participantes([PARTICIPANT_ID]))
      // Mentor circle takes precedence → full read
      assertAllowed(result)
      expect(result.mode).toBe('full')
    })
  })

  // ESC-04: actor has both participation and capability → full read (most privileged)
  describe('ESC-04: most privileged — full read when both P6 and pastoral.read.all', () => {
    it('pastoral.read.all takes precedence over P6 → full read', () => {
      const actor = makeActor(PARTICIPANT_ID, ['pastoral.read.all'])
      const ooo = makeOneOnOne()
      const result = canReadPastoralOneOnOne(actor, ooo, participantes([PARTICIPANT_ID]))
      assertAllowed(result)
      expect(result.mode).toBe('full')
    })
  })

  // ESC-05: no actor / empty personaId → denied
  describe('ESC-05: no actor or empty personaId', () => {
    it('denies when actor is null', () => {
      const ooo = makeOneOnOne()
      const result = canReadPastoralOneOnOne(null, ooo, [])
      assertDenied(result)
      expect(result.reason).toBe('no_actor')
    })

    it('denies when actor is undefined', () => {
      const ooo = makeOneOnOne()
      const result = canReadPastoralOneOnOne(undefined, ooo, [])
      assertDenied(result)
      expect(result.reason).toBe('no_actor')
    })

    it('denies when personaId is empty string', () => {
      const ooo = makeOneOnOne()
      const result = canReadPastoralOneOnOne(makeActor(''), ooo, [])
      assertDenied(result)
      expect(result.reason).toBe('no_actor')
    })

    it('denies when personaId is whitespace only', () => {
      const ooo = makeOneOnOne()
      const result = canReadPastoralOneOnOne(makeActor('   '), ooo, [])
      assertDenied(result)
      expect(result.reason).toBe('no_actor')
    })
  })

  // ESC-06: null oneOnOne → denied
  describe('ESC-06: no oneOnOne record', () => {
    it('denies when oneOnOne is null', () => {
      const actor = makeActor(MENTOR_ID)
      const result = canReadPastoralOneOnOne(actor, null, [])
      assertDenied(result)
      expect(result.reason).toBe('no_one_on_one')
    })

    it('denies when oneOnOne is undefined', () => {
      const actor = makeActor(MENTOR_ID)
      const result = canReadPastoralOneOnOne(actor, undefined, [])
      assertDenied(result)
      expect(result.reason).toBe('no_one_on_one')
    })
  })

  // access_denied: actor is not mentor, not P6, not admin
  describe('access_denied: not in any circle', () => {
    it('denies when actor is unrelated person', () => {
      const actor = makeActor(OTHER_ID)
      const ooo = makeOneOnOne()
      const result = canReadPastoralOneOnOne(actor, ooo, participantes([PARTICIPANT_ID]))
      assertDenied(result)
      expect(result.reason).toBe('access_denied')
    })
  })
})

// ─── Field projection ────────────────────────────────────────────────────────

describe('projectToRoadmap — T2 (notes never in roadmap)', () => {
  it('includes estado, scheduledAt, completedAt, motivoCancelacion', () => {
    const ooo = makeOneOnOne({
      estado: 'completed',
      scheduledAt: '2026-08-01T10:00:00.000Z',
      completedAt: '2026-08-01T11:00:00.000Z',
      motivoCancelacion: 'mutual agreement',
    })
    const roadmap = projectToRoadmap(ooo)
    expect(roadmap.estado).toBe('completed')
    expect(roadmap.scheduledAt).toBe('2026-08-01T10:00:00.000Z')
    expect(roadmap.completedAt).toBe('2026-08-01T11:00:00.000Z')
    expect(roadmap.motivoCancelacion).toBe('mutual agreement')
  })

  it('excludes resumen (T2 — private field never in roadmap)', () => {
    const ooo = makeOneOnOne({ resumen: 'This is private summary' })
    const roadmap = projectToRoadmap(ooo) as unknown as Record<string, unknown>
    expect(roadmap).not.toHaveProperty('resumen')
  })

  it('excludes private fields: motivoNoRealizado, version, createdAt, updatedAt', () => {
    const ooo = makeOneOnOne()
    const roadmap = projectToRoadmap(ooo) as unknown as Record<string, unknown>
    expect(roadmap).not.toHaveProperty('resumen')
    expect(roadmap).not.toHaveProperty('motivoNoRealizado')
    expect(roadmap).not.toHaveProperty('version')
    expect(roadmap).not.toHaveProperty('createdAt')
    expect(roadmap).not.toHaveProperty('updatedAt')
    expect(roadmap).not.toHaveProperty('autorPersonaId')
    expect(roadmap).not.toHaveProperty('mentorOficialPersonaId')
  })
})

// ─── Notes filtering ─────────────────────────────────────────────────────────

describe('filterNotesForActor — T2', () => {
  const notas: PastoralOneOnOneNota[] = [
    { id: 'n1', oneOnOneId: 'ooo-1', autorPersonaId: MENTOR_ID, contenido: 'Nota mentor', createdAt: '2026-07-01T10:00:00.000Z' },
    { id: 'n2', oneOnOneId: 'ooo-1', autorPersonaId: PARTICIPANT_ID, contenido: 'Nota participant', createdAt: '2026-07-01T11:00:00.000Z' },
  ]

  it('returns all notes in full read mode (RLS handles access)', () => {
    const actor = makeActor(MENTOR_ID, ['pastoral.read.all'])
    const result = filterNotesForActor(notas, actor, true)
    expect(result).toHaveLength(2)
  })

  it('returns empty notes in roadmap mode (P6 — T2)', () => {
    const actor = makeActor(PARTICIPANT_ID)
    const result = filterNotesForActor(notas, actor, false)
    expect(result).toHaveLength(0)
  })

  it('returns all notes for participant in full read mode (pastoral.read.all)', () => {
    const actor = makeActor(PARTICIPANT_ID, ['pastoral.read.all'])
    const result = filterNotesForActor(notas, actor, true)
    expect(result).toHaveLength(2)
  })
})
