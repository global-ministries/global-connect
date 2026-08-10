/**
 * PR4 — DT-015 / DT-016 — Talleres state machine tests.
 * F(talleres/state) — covers:
 *  - DT-015: happy path / invalid transition / terminal states / stale version /
 *            motivo obligatorio (reabierto, cancelado) for the 3 state machines
 *  - DT-016: state-machine composition (workshop × enrollment) + assertVersion helper
 *
 * State machines (design.md §7):
 *   workshop:    borrador → abierto → en_curso → cerrado (terminal)
 *                                            ↘ cancelado (terminal; motivo obligatorio)
 *   participant: pendiente → aprobado → unit_estado (completado|no_completado|abandono)
 *                pendiente → no_aprobado → pendiente (only while period active)
 *   report:      borrador → enviado → reabierto (motivo obligatorio) → cerrado
 *                                                ↑ only reopener can edit
 *
 * Optimistic concurrency: `version` integer — stale writes throw StaleVersionError → 409.
 * Terminal states reject all transitions via InvalidTransitionError.
 */
import {
  WORKSHOP_STATES,
  PARTICIPANT_STATES,
  REPORT_STATES,
  transition,
  type WorkshopEstado,
  type ParticipantEstado,
  type ReportEstado,
} from '@/lib/platform/talleres/state'
import {
  InvalidTransitionError,
  StaleVersionError,
  MotivoRequeridoError,
} from '@/lib/platform/talleres/state'
import {
  assertVersion,
  applyWorkshopToEnrollment,
  canEnrollParticipants,
  canReopenReport,
} from '@/lib/platform/talleres/state-machine'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeTallerMetadata(overrides: Partial<{ estado: WorkshopEstado; version: number }> = {}) {
  return {
    taller_id: '00000000-0000-0000-0000-000000000010',
    operating_core_event_id: '00000000-0000-0000-0000-000000000011',
    tipo: 'individual' as const,
    link_type: null,
    modalidad_inscripcion: 'periodo_general' as const,
    estado: 'borrador' as WorkshopEstado,
    nombre_snapshot: 'Taller X',
    sesiones_snapshot: 6,
    duracion_estimada_minutos_snapshot: 90,
    modalidad_inscripcion_snapshot: 'periodo_general' as const,
    firmantes: [],
    version: 1,
    ...overrides,
  }
}

function makeParticipant(overrides: Partial<{ estado: ParticipantEstado; version: number }> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000020',
    taller_id: '00000000-0000-0000-0000-000000000010',
    cohorte_id: '00000000-0000-0000-0000-000000000021',
    persona_principal_id: '00000000-0000-0000-0000-000000000022',
    companero_id: null,
    link_type: null,
    estado: 'pendiente' as ParticipantEstado,
    motivo_no_aprobado: null,
    ocurrencia_objetivo: null,
    unit_estado: null,
    unit_estado_report_id: null,
    version: 1,
    ...overrides,
  }
}

function makeReport(overrides: Partial<{ estado: ReportEstado; version: number }> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000030',
    grupo_id: '00000000-0000-0000-0000-000000000031',
    estado: 'borrador' as ReportEstado,
    observaciones_generales: 'Observaciones de prueba',
    firma_lider_persona_id: null,
    firma_lider_fecha: null,
    reabierto_por_persona_id: null,
    reabierto_motivo: null,
    version: 1,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// DT-014: state constants
// ---------------------------------------------------------------------------

describe('Talleres state machine — constants', () => {
  describe('WORKSHOP_STATES', () => {
    it('contains exactly 5 states: borrador, abierto, en_curso, cerrado, cancelado', () => {
      expect(WORKSHOP_STATES).toHaveLength(5)
      expect([...WORKSHOP_STATES].sort()).toEqual(
        ['abierto', 'borrador', 'cancelado', 'cerrado', 'en_curso'].sort(),
      )
    })
  })

  describe('PARTICIPANT_STATES', () => {
    it('contains exactly 4 states: pendiente, aprobado, completado, no_completado, abandono', () => {
      // pendiente + aprobado + 3 unit_estado terminal sub-states
      expect(PARTICIPANT_STATES).toHaveLength(5)
      expect([...PARTICIPANT_STATES].sort()).toEqual(
        ['abandono', 'aprobado', 'completado', 'no_completado', 'pendiente'].sort(),
      )
    })
  })

  describe('REPORT_STATES', () => {
    it('contains exactly 4 states: borrador, enviado, reabierto, cerrado', () => {
      expect(REPORT_STATES).toHaveLength(4)
      expect([...REPORT_STATES].sort()).toEqual(
        ['borrador', 'cerrado', 'enviado', 'reabierto'].sort(),
      )
    })
  })
})

// ---------------------------------------------------------------------------
// DT-015: workshop state machine — happy path
// ---------------------------------------------------------------------------

describe('Talleres state machine — workshop (happy path)', () => {
  it('borrador → abierto via abrir', () => {
    const taller = makeTallerMetadata({ estado: 'borrador', version: 1 })
    const next = transition({ target: 'workshop', current: taller, action: 'abrir', version: 1 })
    expect(next.estado).toBe('abierto')
    expect(next.version).toBe(2)
  })

  it('abierto → en_curso via iniciar', () => {
    const taller = makeTallerMetadata({ estado: 'abierto', version: 2 })
    const next = transition({ target: 'workshop', current: taller, action: 'iniciar', version: 2 })
    expect(next.estado).toBe('en_curso')
    expect(next.version).toBe(3)
  })

  it('en_curso → cerrado via cerrar', () => {
    const taller = makeTallerMetadata({ estado: 'en_curso', version: 3 })
    const next = transition({ target: 'workshop', current: taller, action: 'cerrar', version: 3 })
    expect(next.estado).toBe('cerrado')
    expect(next.version).toBe(4)
  })

  it('en_curso → cancelado via cancelar (with motivo) is allowed', () => {
    const taller = makeTallerMetadata({ estado: 'en_curso', version: 3 })
    const next = transition({
      target: 'workshop',
      current: taller,
      action: 'cancelar',
      version: 3,
      motivo: 'director_general_disuelve_taller',
    })
    expect(next.estado).toBe('cancelado')
    expect(next.version).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// DT-015: workshop state machine — invalid / terminal
// ---------------------------------------------------------------------------

describe('Talleres state machine — workshop (invalid + terminal)', () => {
  it('rejects borrador → en_curso (skip-ahead) with InvalidTransitionError', () => {
    const taller = makeTallerMetadata({ estado: 'borrador', version: 1 })
    expect(() =>
      transition({ target: 'workshop', current: taller, action: 'iniciar', version: 1 }),
    ).toThrow(InvalidTransitionError)
  })

  it('rejects abierto → cerrado (skip en_curso) with InvalidTransitionError', () => {
    const taller = makeTallerMetadata({ estado: 'abierto', version: 2 })
    expect(() =>
      transition({ target: 'workshop', current: taller, action: 'cerrar', version: 2 }),
    ).toThrow(InvalidTransitionError)
  })

  it('rejects closed (terminal) state — cannot transition', () => {
    const taller = makeTallerMetadata({ estado: 'cerrado', version: 5 })
    expect(() =>
      transition({ target: 'workshop', current: taller, action: 'abrir', version: 5 }),
    ).toThrow(InvalidTransitionError)
  })

  it('rejects cancelado (terminal) state — cannot transition', () => {
    const taller = makeTallerMetadata({ estado: 'cancelado', version: 5 })
    expect(() =>
      transition({ target: 'workshop', current: taller, action: 'abrir', version: 5 }),
    ).toThrow(InvalidTransitionError)
  })
})

// ---------------------------------------------------------------------------
// DT-015: participant state machine — happy path
// ---------------------------------------------------------------------------

describe('Talleres state machine — participant (happy path)', () => {
  it('pendiente → aprobado via aprobar', () => {
    const p = makeParticipant({ estado: 'pendiente', version: 1 })
    const next = transition({
      target: 'participant',
      current: p,
      action: 'aprobar',
      version: 1,
    })
    expect(next.estado).toBe('aprobado')
    expect(next.version).toBe(2)
  })

  it('pendiente → no_aprobado via rechazar (with motivo) is allowed', () => {
    const p = makeParticipant({ estado: 'pendiente', version: 1 })
    const next = transition({
      target: 'participant',
      current: p,
      action: 'rechazar',
      version: 1,
      motivo: 'fuera_de_periodo',
    })
    expect(next.estado).toBe('no_aprobado')
    expect(next.version).toBe(2)
  })

  it('aprobado → completado via completar (sets unit_estado)', () => {
    const p = makeParticipant({ estado: 'aprobado', version: 2 })
    const next = transition({
      target: 'participant',
      current: p,
      action: 'completar',
      version: 2,
    })
    expect(next.estado).toBe('completado')
    expect(next.version).toBe(3)
  })

  it('aprobado → no_completado via no_completar', () => {
    const p = makeParticipant({ estado: 'aprobado', version: 2 })
    const next = transition({
      target: 'participant',
      current: p,
      action: 'no_completar',
      version: 2,
    })
    expect(next.estado).toBe('no_completado')
    expect(next.version).toBe(3)
  })

  it('aprobado → abandono via marcar_abandono', () => {
    const p = makeParticipant({ estado: 'aprobado', version: 2 })
    const next = transition({
      target: 'participant',
      current: p,
      action: 'marcar_abandono',
      version: 2,
    })
    expect(next.estado).toBe('abandono')
    expect(next.version).toBe(3)
  })

  it('no_aprobado → pendiente via reanudar (resume — only while period active)', () => {
    const p = makeParticipant({ estado: 'no_aprobado', version: 3 })
    const next = transition({
      target: 'participant',
      current: p,
      action: 'reanudar',
      version: 3,
    })
    expect(next.estado).toBe('pendiente')
    expect(next.version).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// DT-015: participant state machine — invalid / terminal / motivo
// ---------------------------------------------------------------------------

describe('Talleres state machine — participant (invalid + terminal + motivo)', () => {
  it('rejects aprobado → pendiente directly (no resume from aprobado) with InvalidTransitionError', () => {
    const p = makeParticipant({ estado: 'aprobado', version: 2 })
    expect(() =>
      transition({ target: 'participant', current: p, action: 'reanudar', version: 2 }),
    ).toThrow(InvalidTransitionError)
  })

  it('rejects completado (terminal) state — cannot transition', () => {
    const p = makeParticipant({ estado: 'completado', version: 4 })
    expect(() =>
      transition({ target: 'participant', current: p, action: 'aprobar', version: 4 }),
    ).toThrow(InvalidTransitionError)
  })

  it('rejects no_completado (terminal) state — cannot transition', () => {
    const p = makeParticipant({ estado: 'no_completado', version: 4 })
    expect(() =>
      transition({ target: 'participant', current: p, action: 'completar', version: 4 }),
    ).toThrow(InvalidTransitionError)
  })

  it('rejects abandono (terminal) state — cannot transition', () => {
    const p = makeParticipant({ estado: 'abandono', version: 4 })
    expect(() =>
      transition({ target: 'participant', current: p, action: 'completar', version: 4 }),
    ).toThrow(InvalidTransitionError)
  })

  it('rejects rechazar without motivo with MotivoRequeridoError', () => {
    const p = makeParticipant({ estado: 'pendiente', version: 1 })
    expect(() =>
      transition({ target: 'participant', current: p, action: 'rechazar', version: 1 }),
    ).toThrow(MotivoRequeridoError)
  })

  it('rejects rechazar with empty motivo with MotivoRequeridoError', () => {
    const p = makeParticipant({ estado: 'pendiente', version: 1 })
    expect(() =>
      transition({
        target: 'participant',
        current: p,
        action: 'rechazar',
        version: 1,
        motivo: '   ',
      }),
    ).toThrow(MotivoRequeridoError)
  })
})

// ---------------------------------------------------------------------------
// DT-015: report state machine — happy path
// ---------------------------------------------------------------------------

describe('Talleres state machine — report (happy path)', () => {
  it('borrador → enviado via enviar', () => {
    const r = makeReport({ estado: 'borrador', version: 1 })
    const next = transition({ target: 'report', current: r, action: 'enviar', version: 1 })
    expect(next.estado).toBe('enviado')
    expect(next.version).toBe(2)
  })

  it('enviado → reabierto via reabrir (with motivo) is allowed', () => {
    const r = makeReport({ estado: 'enviado', version: 2 })
    const next = transition({
      target: 'report',
      current: r,
      action: 'reabrir',
      version: 2,
      motivo: 'correccion_de_asistencias',
    })
    expect(next.estado).toBe('reabierto')
    expect(next.version).toBe(3)
  })

  it('reabierto → cerrado via cerrar (only reopener can edit-and-republish)', () => {
    const r = makeReport({ estado: 'reabierto', version: 3 })
    const next = transition({ target: 'report', current: r, action: 'cerrar', version: 3 })
    expect(next.estado).toBe('cerrado')
    expect(next.version).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// DT-015: report state machine — invalid / terminal / motivo
// ---------------------------------------------------------------------------

describe('Talleres state machine — report (invalid + terminal + motivo)', () => {
  it('rejects borrador → cerrado (skip enviado) with InvalidTransitionError', () => {
    const r = makeReport({ estado: 'borrador', version: 1 })
    expect(() =>
      transition({ target: 'report', current: r, action: 'cerrar', version: 1 }),
    ).toThrow(InvalidTransitionError)
  })

  it('rejects enviado → cerrado (skip reabierto) with InvalidTransitionError', () => {
    const r = makeReport({ estado: 'enviado', version: 2 })
    expect(() =>
      transition({ target: 'report', current: r, action: 'cerrar', version: 2 }),
    ).toThrow(InvalidTransitionError)
  })

  it('rejects cerrado (terminal) state — cannot transition', () => {
    const r = makeReport({ estado: 'cerrado', version: 4 })
    expect(() =>
      transition({ target: 'report', current: r, action: 'reabrir', version: 4 }),
    ).toThrow(InvalidTransitionError)
  })

  it('rejects reabrir without motivo with MotivoRequeridoError', () => {
    const r = makeReport({ estado: 'enviado', version: 2 })
    expect(() =>
      transition({ target: 'report', current: r, action: 'reabrir', version: 2 }),
    ).toThrow(MotivoRequeridoError)
  })

  it('rejects reabrir with empty motivo with MotivoRequeridoError', () => {
    const r = makeReport({ estado: 'enviado', version: 2 })
    expect(() =>
      transition({
        target: 'report',
        current: r,
        action: 'reabrir',
        version: 2,
        motivo: '',
      }),
    ).toThrow(MotivoRequeridoError)
  })
})

// ---------------------------------------------------------------------------
// DT-015: stale version → StaleVersionError (409)
// ---------------------------------------------------------------------------

describe('Talleres state machine — stale version', () => {
  it('workshop: stale version throws StaleVersionError', () => {
    const taller = makeTallerMetadata({ estado: 'abierto', version: 5 })
    let caught: unknown
    try {
      transition({ target: 'workshop', current: taller, action: 'iniciar', version: 3 })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(StaleVersionError)
    const err = caught as StaleVersionError
    expect(err.actual).toBe(5)
    expect(err.expected).toBe(3)
  })

  it('participant: stale version throws StaleVersionError', () => {
    const p = makeParticipant({ estado: 'pendiente', version: 2 })
    expect(() =>
      transition({ target: 'participant', current: p, action: 'aprobar', version: 1 }),
    ).toThrow(StaleVersionError)
  })

  it('report: stale version throws StaleVersionError', () => {
    const r = makeReport({ estado: 'borrador', version: 2 })
    expect(() =>
      transition({ target: 'report', current: r, action: 'enviar', version: 1 }),
    ).toThrow(StaleVersionError)
  })

  it('workshop: rejects cancelar without motivo with MotivoRequeridoError (also requires motivo)', () => {
    const taller = makeTallerMetadata({ estado: 'en_curso', version: 3 })
    expect(() =>
      transition({ target: 'workshop', current: taller, action: 'cancelar', version: 3 }),
    ).toThrow(MotivoRequeridoError)
  })

  it('workshop: rejects cancelar with empty motivo with MotivoRequeridoError', () => {
    const taller = makeTallerMetadata({ estado: 'en_curso', version: 3 })
    expect(() =>
      transition({
        target: 'workshop',
        current: taller,
        action: 'cancelar',
        version: 3,
        motivo: '  ',
      }),
    ).toThrow(MotivoRequeridoError)
  })
})

// ---------------------------------------------------------------------------
// DT-016: state-machine composition (workshop × enrollment)
// ---------------------------------------------------------------------------

describe('state-machine composition', () => {
  describe('canEnrollParticipants', () => {
    it('returns true when workshop is abierto', () => {
      expect(canEnrollParticipants('abierto')).toBe(true)
    })

    it('returns true when workshop is en_curso', () => {
      expect(canEnrollParticipants('en_curso')).toBe(true)
    })

    it('returns false when workshop is borrador', () => {
      expect(canEnrollParticipants('borrador')).toBe(false)
    })

    it('returns false when workshop is cerrado', () => {
      expect(canEnrollParticipants('cerrado')).toBe(false)
    })

    it('returns false when workshop is cancelado', () => {
      expect(canEnrollParticipants('cancelado')).toBe(false)
    })
  })

  describe('applyWorkshopToEnrollment', () => {
    it('rejects enrollment when workshop is in borrador', () => {
      const taller = makeTallerMetadata({ estado: 'borrador' })
      const p = makeParticipant({ estado: 'pendiente' })
      expect(() => applyWorkshopToEnrollment(taller, p, 'aprobar')).toThrow(InvalidTransitionError)
    })

    it('rejects enrollment when workshop is cerrado', () => {
      const taller = makeTallerMetadata({ estado: 'cerrado' })
      const p = makeParticipant({ estado: 'pendiente' })
      expect(() => applyWorkshopToEnrollment(taller, p, 'aprobar')).toThrow(InvalidTransitionError)
    })

    it('rejects enrollment when workshop is cancelado', () => {
      const taller = makeTallerMetadata({ estado: 'cancelado' })
      const p = makeParticipant({ estado: 'pendiente' })
      expect(() => applyWorkshopToEnrollment(taller, p, 'aprobar')).toThrow(InvalidTransitionError)
    })

    it('accepts approval when workshop is abierto', () => {
      const taller = makeTallerMetadata({ estado: 'abierto', version: 2 })
      const p = makeParticipant({ estado: 'pendiente', version: 1 })
      const next = applyWorkshopToEnrollment(taller, p, 'aprobar')
      expect(next.estado).toBe('aprobado')
      expect(next.version).toBe(2)
    })

    it('accepts approval when workshop is en_curso', () => {
      const taller = makeTallerMetadata({ estado: 'en_curso', version: 2 })
      const p = makeParticipant({ estado: 'pendiente', version: 1 })
      const next = applyWorkshopToEnrollment(taller, p, 'aprobar')
      expect(next.estado).toBe('aprobado')
      expect(next.version).toBe(2)
    })
  })

  describe('canReopenReport', () => {
    it('returns true for enviado (only valid source state)', () => {
      expect(canReopenReport('enviado')).toBe(true)
    })

    it('returns false for borrador (cannot reopen from draft)', () => {
      expect(canReopenReport('borrador')).toBe(false)
    })

    it('returns false for reabierto (already reopened)', () => {
      expect(canReopenReport('reabierto')).toBe(false)
    })

    it('returns false for cerrado (terminal)', () => {
      expect(canReopenReport('cerrado')).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// DT-016: assertVersion helper
// ---------------------------------------------------------------------------

describe('assertVersion helper', () => {
  it('does not throw when versions match', () => {
    expect(() => assertVersion(5, 5)).not.toThrow()
  })

  it('throws StaleVersionError with both values when they differ', () => {
    let caught: unknown
    try {
      assertVersion(5, 3)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(StaleVersionError)
    const err = caught as StaleVersionError
    expect(err.actual).toBe(5)
    expect(err.expected).toBe(3)
  })
})
