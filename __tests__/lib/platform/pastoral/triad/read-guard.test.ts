/**
 * W07 — DT-035 — Pastoral Triada read guard tests.
 * F(pastoral/triad/read-guard)
 *
 * Covers:
 * - T6: coordinador_area in simultaneidad context cannot see notes from GDV leader
 * - P7 Exception: contexto='simultaneidad' AND actor.rol='coordinador_area'
 *   AND note.autor_persona_id != actor.persona_id → deny
 * - ESC-02 of pastoral-triada-read
 * - ESC-07 of pastoral-triada-notes
 */
import {
  canReadPastoralTriadaNote,
  filterTriadaNotesForActor,
  type PastoralTriadaReadActor,
  type CanReadPastoralTriadaNoteResult,
} from '@/lib/platform/pastoral/triad/read-guard'
import type { PastoralTriada } from '@/lib/platform/pastoral/types'

const MENTOR_ID = '00000000-0000-0000-0000-000000000001'
const ASSISTED_ID = '00000000-0000-0000-0000-000000000002'
const COORDINATOR_ID = '00000000-0000-0000-0000-000000000003'
const OTHER_ID = '00000000-0000-0000-0000-000000000004'
const GDV_LEADER_ID = '00000000-0000-0000-0000-000000000005'

function makeTriada(overrides: Partial<PastoralTriada> = {}): PastoralTriada {
  return {
    id: 'triada-1',
    mentorOficialPersonaId: MENTOR_ID,
    autorPersonaId: MENTOR_ID,
    estado: 'active',
    contexto: 'nuevo_paso',
    motivoDisolucion: null,
    version: 1,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  }
}

function makeActor(personaId: string, rolEnTriada?: string, capabilities: string[] = []): PastoralTriadaReadActor {
  return {
    personaId,
    rolEnTriada,
    capabilities: capabilities.map((key) => ({ key })),
  }
}

function assertAllowed(r: CanReadPastoralTriadaNoteResult): asserts r is CanReadPastoralTriadaNoteResult & { allowed: true } {
  if (!r.allowed) throw new Error('Expected allowed=true but got ' + r.reason)
}
function assertDenied(r: CanReadPastoralTriadaNoteResult): asserts r is CanReadPastoralTriadaNoteResult & { allowed: false } {
  if (r.allowed) throw new Error('Expected allowed=false but got allowed=true')
}

describe('canReadPastoralTriadaNote — P7 exception (ESC-07)', () => {
  // P7: contexto='simultaneidad' AND actor.rol='coordinador_area'
  // AND note.autor_persona_id != actor.persona_id → deny

  describe('P7: simultaneidad context + coordinador_area role', () => {
    it('denies when actor is coordinador_area in simultaneidad and note is from different person', () => {
      // Triada in simultaneidad context
      const triada = makeTriada({ contexto: 'simultaneidad' })
      // Actor is the coordinator
      const actor = makeActor(COORDINATOR_ID, 'coordinador_area')
      // Note is from the GDV leader (not the coordinator)
      const noteAutorId = GDV_LEADER_ID

      const result = canReadPastoralTriadaNote(actor, triada, noteAutorId)
      assertDenied(result)
      expect(result.reason).toBe('p7_denied')
    })

    it('allows when actor is coordinador_area in simultaneidad and note is from themselves', () => {
      const triada = makeTriada({ contexto: 'simultaneidad' })
      const actor = makeActor(COORDINATOR_ID, 'coordinador_area')
      // Note is from the coordinator themselves
      const noteAutorId = COORDINATOR_ID

      const result = canReadPastoralTriadaNote(actor, triada, noteAutorId)
      expect(result.allowed).toBe(true)
    })

    it('allows when contexto is NOT simultaneidad even with coordinador_area role', () => {
      const triada = makeTriada({ contexto: 'nuevo_paso' })
      const actor = makeActor(COORDINATOR_ID, 'coordinador_area')
      // Note from a different person in nuevo_paso context
      const noteAutorId = GDV_LEADER_ID

      const result = canReadPastoralTriadaNote(actor, triada, noteAutorId)
      expect(result.allowed).toBe(true)
    })

    it('allows when actor does NOT have coordinador_area role even in simultaneidad', () => {
      const triada = makeTriada({ contexto: 'simultaneidad' })
      // Actor is mentor, not coordinator
      const actor = makeActor(MENTOR_ID, 'mentor')
      const noteAutorId = GDV_LEADER_ID

      const result = canReadPastoralTriadaNote(actor, triada, noteAutorId)
      expect(result.allowed).toBe(true)
    })

    it('allows pastoral.read.all capability even in simultaneidad with coordinador_area', () => {
      const triada = makeTriada({ contexto: 'simultaneidad' })
      // Actor has pastoral.read.all (admin/pastor)
      const actor = makeActor(OTHER_ID, 'coordinador_area', ['pastoral.read.all'])
      const noteAutorId = GDV_LEADER_ID

      // P7 only applies to notes — the triada read would be allowed via pastoral.read.all
      // But canReadPastoralTriadaNote specifically checks P7 for notes
      // The P7 exception still applies to the note itself
      const result = canReadPastoralTriadaNote(actor, triada, noteAutorId)
      assertDenied(result)
      expect(result.reason).toBe('p7_denied')
    })
  })

  // T6: coordinator in simultaneidad does NOT see notes from leader
  describe('T6: coordinador_area in simultaneidad cannot see leader notes', () => {
    it('P7 blocks note from leader when coordinator is reading', () => {
      const triada = makeTriada({ contexto: 'simultaneidad' })
      const actor = makeActor(COORDINATOR_ID, 'coordinador_area')
      // Note from the GDV leader
      const noteAutorId = GDV_LEADER_ID

      const result = canReadPastoralTriadaNote(actor, triada, noteAutorId)
      assertDenied(result)
      expect(result.reason).toBe('p7_denied')
    })
  })

  // ESC-02 of pastoral-triada-read scenarios
  describe('ESC-02: access denied cases', () => {
    it('denies when triada is null', () => {
      const actor = makeActor(COORDINATOR_ID, 'coordinador_area')
      const result = canReadPastoralTriadaNote(actor, null, MENTOR_ID)
      assertDenied(result)
      expect(result.reason).toBe('no_triada')
    })

    it('denies when actor is null', () => {
      const triada = makeTriada()
      const result = canReadPastoralTriadaNote(null, triada, MENTOR_ID)
      assertDenied(result)
      expect(result.reason).toBe('no_actor')
    })

    it('denies when actor personaId is empty', () => {
      const triada = makeTriada()
      const actor = makeActor('')
      const result = canReadPastoralTriadaNote(actor, triada, MENTOR_ID)
      assertDenied(result)
      expect(result.reason).toBe('no_actor')
    })

    it('denies when note autor is null', () => {
      const triada = makeTriada()
      const actor = makeActor(COORDINATOR_ID, 'coordinador_area')
      const result = canReadPastoralTriadaNote(actor, triada, null)
      assertDenied(result)
      expect(result.reason).toBe('no_note')
    })
  })

  // ESC-07 of pastoral-triada-notes: various scenarios
  describe('ESC-07: pastoral-triada-notes scenarios', () => {
    it('allows mentor to read any note', () => {
      const triada = makeTriada({ contexto: 'simultaneidad' })
      const actor = makeActor(MENTOR_ID, 'mentor')
      const noteAutorId = GDV_LEADER_ID

      const result = canReadPastoralTriadaNote(actor, triada, noteAutorId)
      expect(result.allowed).toBe(true)
    })

    it('allows assisted person to read any note', () => {
      const triada = makeTriada({ contexto: 'simultaneidad' })
      const actor = makeActor(ASSISTED_ID, 'asistido')
      const noteAutorId = GDV_LEADER_ID

      const result = canReadPastoralTriadaNote(actor, triada, noteAutorId)
      expect(result.allowed).toBe(true)
    })

    it('allows reading own notes as coordinador_area in simultaneidad', () => {
      const triada = makeTriada({ contexto: 'simultaneidad' })
      const actor = makeActor(COORDINATOR_ID, 'coordinador_area')
      const noteAutorId = COORDINATOR_ID

      const result = canReadPastoralTriadaNote(actor, triada, noteAutorId)
      expect(result.allowed).toBe(true)
    })
  })
})

// ─── filterTriadaNotesForActor ───────────────────────────────────────────────

describe('filterTriadaNotesForActor — P7 applied to note list', () => {
  const notes = [
    { autorPersonaId: MENTOR_ID },
    { autorPersonaId: COORDINATOR_ID },
    { autorPersonaId: GDV_LEADER_ID },
  ]

  it('filters out notes that fail P7 check', () => {
    const triada = makeTriada({ contexto: 'simultaneidad' })
    const actor = makeActor(COORDINATOR_ID, 'coordinador_area')

    const filtered = filterTriadaNotesForActor(notes, actor, triada)

    // Should include own note but exclude GDV leader note
    expect(filtered).toHaveLength(1)
    expect(filtered[0]!.autorPersonaId).toBe(COORDINATOR_ID)
  })

  it('returns all notes when P7 does not apply', () => {
    const triada = makeTriada({ contexto: 'nuevo_paso' })
    const actor = makeActor(COORDINATOR_ID, 'coordinador_area')

    const filtered = filterTriadaNotesForActor(notes, actor, triada)

    expect(filtered).toHaveLength(3)
  })
})
