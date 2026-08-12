/**
 * PR14 — DT-050 — Route-integration contract tests.
 *
 * Pure unit tests verifying the versioned TallerView shape and the
 * toTallerView projection. CI grep guard is in
 * `__tests__/invariants/talleres-ruta.test.ts`.
 */

import {
  currentSchemaVersion,
  SCHEMA_VERSION,
  toMinimalTallerView,
  toTallerView,
} from '@/lib/platform/talleres/route-integration'

const sampleInput = {
  taller: {
    id: '00000000-0000-0000-0000-000000000001',
    nombre_snapshot: 'Matrimonio 101 — Edición Otoño 2026',
    tipo: 'pareja' as const,
    edicion: 'otoño-2026',
    estado: 'en_curso' as const,
  },
  periodo: {
    id: '00000000-0000-0000-0000-000000000010',
    edicion_label: 'otoño-2026',
    fecha_cierre_real: '2026-12-15',
  },
  inscripcion: {
    estado: 'aprobado' as const,
    unit_estado: null,
    fecha_completitud: null,
  },
  certificado: {
    id: '00000000-0000-0000-0000-000000000020',
    codigo_verificacion: 'abcdefghijkmnpqr',
    created_at: null,
  },
  sesiones: [
    { id: 's-1' },
    { id: 's-2' },
    { id: 's-3' },
  ],
}

describe('SCHEMA_VERSION', () => {
  it('is exactly v1', () => {
    expect(SCHEMA_VERSION).toBe('v1')
  })

  it('currentSchemaVersion() returns v1', () => {
    expect(currentSchemaVersion()).toBe('v1')
  })
})

describe('toTallerView (projection)', () => {
  it('maps all allowed fields exactly', () => {
    const view = toTallerView(sampleInput)
    expect(view.taller_id).toBe(sampleInput.taller.id)
    expect(view.nombre).toBe(sampleInput.taller.nombre_snapshot)
    expect(view.tipo).toBe('pareja')
    expect(view.edicion).toBe('otoño-2026')
    expect(view.estado).toBe('en_curso')
    expect(view.sesiones_total).toBe(3)
    expect(view.periodo).toEqual({
      id: sampleInput.periodo.id,
      nombre: sampleInput.periodo.edicion_label,
      fecha_cierre_real: '2026-12-15',
    })
    expect(view.inscripcion?.estado).toBe('aprobado')
    expect(view.certificado?.codigo_verificacion).toBe('abcdefghijkmnpqr')
  })

  it('returns null periodo when input.periodo is null', () => {
    const view = toTallerView({ ...sampleInput, periodo: null })
    expect(view.periodo).toBeNull()
  })

  it('returns null inscripcion when input.inscripcion is null', () => {
    const view = toTallerView({ ...sampleInput, inscripcion: null })
    expect(view.inscripcion).toBeNull()
  })

  it('returns null certificado when input.certificado is null', () => {
    const view = toTallerView({ ...sampleInput, certificado: null })
    expect(view.certificado).toBeNull()
  })

  it('counts sesiones_total from the sesiones array', () => {
    expect(toTallerView({ ...sampleInput, sesiones: [] }).sesiones_total).toBe(0)
    expect(
      toTallerView({
        ...sampleInput,
        sesiones: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }],
      }).sesiones_total,
    ).toBe(5)
  })

  it('emits certificado.emitido_at from the created_at snapshot', () => {
    const view = toTallerView({
      ...sampleInput,
      certificado: { ...sampleInput.certificado, created_at: '2026-12-20T15:00:00.000Z' },
    })
    expect(view.certificado?.emitido_at).toBe('2026-12-20T15:00:00.000Z')
  })
})

describe('toMinimalTallerView (cascade consumer subset)', () => {
  it('strips certificado + sesiones_total, keeps the rest', () => {
    const view = toTallerView(sampleInput)
    const minimal = toMinimalTallerView(view)
    expect(minimal).toEqual({
      taller_id: view.taller_id,
      nombre: view.nombre,
      tipo: view.tipo,
      edicion: view.edicion,
      estado: view.estado,
      periodo: view.periodo,
      inscripcion: view.inscripcion,
    })
    // Cert and sesiones_total are NOT in the return type.
    expect('certificado' in (minimal as object)).toBe(false)
    expect('sesiones_total' in (minimal as object)).toBe(false)
  })
})

describe('Contract integrity — sensitive fields are excluded', () => {
  it('TallerView never carries motivos or attendance rows', () => {
    const view = toTallerView(sampleInput)
    const keys = Object.keys(view).sort()
    expect(keys).toEqual([
      'certificado',
      'edicion',
      'estado',
      'inscripcion',
      'nombre',
      'periodo',
      'sesiones_total',
      'taller_id',
      'tipo',
    ])
    expect(keys).not.toContain('motivo')
    expect(keys).not.toContain('motivos')
    expect(keys).not.toContain('notas')
    expect(keys).not.toContain('attendance')
  })
})
