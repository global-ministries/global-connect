/**
 * @jest-environment node
 *
 * T8b (odd/tasks/talleres-reserva-publica.md, S17) — pure helpers of the
 * recovered clase: progress toward the certificate (same rule as
 * talleres_cierre_resultados), copy, error translation, and the fail-soft
 * reads of the grupo page.
 */

import {
  loadMarcasGrupo,
  loadPermiteRecuperar,
  loadRecuperacionesGrupo,
  parseRecuperaciones,
  progresoCertificado,
  textoAsistencia,
  textoFaltan,
  traducirErrorRecuperacion,
  type ProgresoEntrada,
} from '@/lib/platform/talleres/recuperar-clase'

const SESIONES = [
  { id: 's1', estado: 'cerrada' },
  { id: 's2', estado: 'cerrada' },
  { id: 's3', estado: 'en_curso' },
  { id: 's4', estado: 'programada' },
  { id: 's5', estado: 'cancelada' },
]

function entrada(overrides: Partial<ProgresoEntrada> = {}): ProgresoEntrada {
  return {
    sesiones: SESIONES,
    inscripciones: [
      { id: 'i1', personaId: 'p1' },
      { id: 'i2', personaId: 'p2' },
    ],
    marcas: [
      { sesionId: 's1', inscripcionId: 'i1', estado: 'ausente' },
      { sesionId: 's2', inscripcionId: 'i1', estado: 'presente' },
      { sesionId: 's3', inscripcionId: 'i1', estado: 'presente' },
      { sesionId: 's1', inscripcionId: 'i2', estado: 'ausente' },
      { sesionId: 's2', inscripcionId: 'i2', estado: 'ausente' },
      { sesionId: 's3', inscripcionId: 'i2', estado: 'presente' },
    ],
    recuperaciones: [{ id: 'r1', sesionId: 's1', personaId: 'p1', fecha: '2026-10-24', dadaPor: 'f1', nota: null }],
    clasesMinimas: 3,
    permiteRecuperar: true,
    ...overrides,
  }
}

describe('progresoCertificado', () => {
  it('counts a recovered clase as attended, once, and how many are missing', () => {
    const p = progresoCertificado(entrada())
    expect(p.get('i1')).toEqual({ asistidas: 3, recuperadas: 1, dictadas: 3, requeridas: 3, faltan: 0, enRiesgo: false })
    // i2: 1 of 3 held, needs 3, one clase left → cannot make it without recovering.
    expect(p.get('i2')).toEqual({ asistidas: 1, recuperadas: 0, dictadas: 3, requeridas: 3, faltan: 2, enRiesgo: true })
  })

  it('a recovery on a presente mark does not count twice', () => {
    const p = progresoCertificado(
      entrada({ recuperaciones: [{ id: 'r9', sesionId: 's2', personaId: 'p1', fecha: '2026-10-24', dadaPor: 'f1', nota: null }] }),
    )
    expect(p.get('i1')).toMatchObject({ asistidas: 2, recuperadas: 0 })
  })

  it('with the switch off recoveries do not count', () => {
    expect(progresoCertificado(entrada({ permiteRecuperar: false })).get('i1')).toMatchObject({ asistidas: 2, recuperadas: 0, faltan: 1 })
  })

  it('null minimum = every planned clase (cancelled ones excluded); the minimum never exceeds them', () => {
    expect(progresoCertificado(entrada({ clasesMinimas: null })).get('i1')).toMatchObject({ requeridas: 4, faltan: 1, enRiesgo: false })
    expect(progresoCertificado(entrada({ clasesMinimas: 9 })).get('i1')).toMatchObject({ requeridas: 4 })
  })

  it('no clases: nothing required', () => {
    expect(progresoCertificado(entrada({ sesiones: [] })).get('i1')).toEqual({
      asistidas: 0, recuperadas: 0, dictadas: 0, requeridas: 0, faltan: 0, enRiesgo: false,
    })
  })
})

describe('copy', () => {
  it('textoAsistencia', () => {
    expect(textoAsistencia({ asistidas: 3, recuperadas: 1, dictadas: 3, requeridas: 3, faltan: 0, enRiesgo: false })).toBe('Vino 3 de 3 · 1 recuperada')
    expect(textoAsistencia({ asistidas: 2, recuperadas: 2, dictadas: 4, requeridas: 3, faltan: 1, enRiesgo: false })).toBe('Vino 2 de 4 · 2 recuperadas')
    expect(textoAsistencia({ asistidas: 1, recuperadas: 0, dictadas: 2, requeridas: 3, faltan: 2, enRiesgo: false })).toBe('Vino 1 de 2')
  })

  it('textoFaltan', () => {
    const base = { asistidas: 0, recuperadas: 0, dictadas: 0, requeridas: 0, enRiesgo: false }
    expect(textoFaltan({ ...base, faltan: 0 })).toBeNull()
    expect(textoFaltan({ ...base, faltan: 1 })).toBe('Falta 1 clase para el certificado')
    expect(textoFaltan({ ...base, faltan: 2 })).toBe('Faltan 2 clases para el certificado')
  })
})

describe('traducirErrorRecuperacion', () => {
  it.each([
    ['RECUPERACION_NO_PERMITIDA', 'Este taller no permite recuperar clases aparte. Actívalo en la configuración del taller.'],
    ['RECUPERACION_YA_REGISTRADA', 'Esta persona ya recuperó esa clase.'],
    ['PERSONA_NO_AUSENTE', 'Solo se recupera una clase a la que la persona faltó en este grupo.'],
    ['CLASE_NO_CERRADA', 'Solo se recupera una clase que ya está cerrada.'],
    ['FECHA_RECUPERACION_FUTURA', 'La fecha de la recuperación no puede ser futura.'],
    ['FECHA_RECUPERACION_ANTES_DE_LA_CLASE', 'La recuperación no puede ser antes de la clase que recupera.'],
    ['EDICION_YA_CERRADA', 'La edición ya está cerrada y sus certificados emitidos; no se pueden cambiar las recuperaciones.'],
    ['sin_permisos_para_este_grupo', 'Solo el líder del grupo o la coordinación del taller registran recuperaciones.'],
  ])('%s', (codigo, mensaje) => {
    expect(traducirErrorRecuperacion({ code: 'P0001', message: codigo }, 'x').message).toBe(mensaje)
  })

  it('falls back to the shared translator and never leaks raw text', () => {
    expect(traducirErrorRecuperacion({ code: 'XX000', message: 'boom internal' }, 'No se pudo.')).toEqual({
      error: 'internal',
      message: 'No se pudo.',
    })
  })
})

describe('reads', () => {
  function cliente(result: { data: unknown; error: unknown }) {
    const chain: Record<'select' | 'eq' | 'in' | 'maybeSingle', jest.Mock> = {
      select: jest.fn(),
      eq: jest.fn(),
      in: jest.fn(() => Promise.resolve(result)),
      maybeSingle: jest.fn(() => Promise.resolve(result)),
    }
    chain.select.mockReturnValue(chain)
    chain.eq.mockReturnValue(chain)
    return { from: jest.fn(() => chain), chain }
  }

  it('parseRecuperaciones keeps well-formed rows and trims the timestamp to a date', () => {
    expect(
      parseRecuperaciones([
        { id: 'r1', sesion_id: 's1', persona_id: 'p1', fecha: '2026-10-24', dada_por: 'f1', nota: '' },
        { id: 'r2', sesion_id: 's1', persona_id: 'p2', fecha: '2026-10-25T00:00:00', dada_por: 'f1', nota: 'Grupo 3' },
        { id: 3 },
      ]),
    ).toEqual([
      { id: 'r1', sesionId: 's1', personaId: 'p1', fecha: '2026-10-24', dadaPor: 'f1', nota: null },
      { id: 'r2', sesionId: 's1', personaId: 'p2', fecha: '2026-10-25', dadaPor: 'f1', nota: 'Grupo 3' },
    ])
  })

  it('loadRecuperacionesGrupo queries by sesión ids and fails soft', async () => {
    const ok = cliente({ data: [{ id: 'r1', sesion_id: 's1', persona_id: 'p1', fecha: '2026-10-24', dada_por: 'f1', nota: null }], error: null })
    await expect(loadRecuperacionesGrupo(ok, ['s1', 's2'])).resolves.toHaveLength(1)
    expect(ok.from).toHaveBeenCalledWith('taller_recuperaciones')
    expect(ok.chain.in).toHaveBeenCalledWith('sesion_id', ['s1', 's2'])

    const missing = cliente({ data: null, error: { message: 'relation "taller_recuperaciones" does not exist' } })
    await expect(loadRecuperacionesGrupo(missing, ['s1'])).resolves.toEqual([])
    const nada = cliente({ data: [], error: null })
    await expect(loadRecuperacionesGrupo(nada, [])).resolves.toEqual([])
    expect(nada.from).not.toHaveBeenCalled()
  })

  it('loadMarcasGrupo maps rows and fails soft', async () => {
    const ok = cliente({ data: [{ sesion_id: 's1', inscripcion_id: 'i1', estado: 'ausente' }, { sesion_id: 's1', estado: 'raro' }], error: null })
    await expect(loadMarcasGrupo(ok, ['s1'])).resolves.toEqual([{ sesionId: 's1', inscripcionId: 'i1', estado: 'ausente' }])
    await expect(loadMarcasGrupo(cliente({ data: null, error: { message: 'x' } }), ['s1'])).resolves.toEqual([])
  })

  it('loadPermiteRecuperar is true only for an explicit true', async () => {
    await expect(loadPermiteRecuperar(cliente({ data: { permite_recuperar_clases: true }, error: null }), 't')).resolves.toBe(true)
    await expect(loadPermiteRecuperar(cliente({ data: { permite_recuperar_clases: false }, error: null }), 't')).resolves.toBe(false)
    await expect(loadPermiteRecuperar(cliente({ data: null, error: { message: 'column does not exist' } }), 't')).resolves.toBe(false)
  })
})
