import { aDatosVivo, aOpcionesVivo } from '@/lib/platform/estudiantes/vivo-datos'

/**
 * The live view data (C4b of odd/tasks/estudiantes-fase-b.md): the rows of
 * estudiantes_vivo_opciones and the jsonb of estudiantes_en_vivo, read
 * defensively. Every person is fictitious.
 */

describe('aOpcionesVivo', () => {
  it('maps the RPC rows', () => {
    expect(
      aOpcionesVivo([
        { ambito_id: 'a1', ambito: 'Transit', campus_id: 'c1', campus: 'Barquisimeto', fecha: '2026-11-01', turno_id: 't1', turno: '1er servicio', hora: '09:00:00' },
      ]),
    ).toEqual([{ ambitoId: 'a1', ambito: 'Transit', campusId: 'c1', campus: 'Barquisimeto', fecha: '2026-11-01', turnoId: 't1', turno: '1er servicio', hora: '09:00:00' }])
  })
})

describe('aDatosVivo', () => {
  const payload = {
    ambito_id: 'a1',
    fecha: '2026-11-01',
    turno_id: 't1',
    grupos: [
      {
        grupo_id: 'g1',
        nombre: '1er año · Chicas',
        subarea: 'Grupos de Chicas',
        anio: 1,
        anio_etiqueta: '1er año',
        lideres: ['Fernanda Ochoa', 'Diana Peraza'],
        presentes: 11,
        ausentes: 3,
        visitantes: 1,
        sin_marcar: 0,
      },
      { nombre: 'sin id' },
    ],
    visitantes_hoy: [
      {
        persona_id: 'p1',
        nombre: 'Emilia',
        apellido: 'Rangel',
        grupo_id: 'g1',
        grupo: '1er año · Chicas',
        anio_etiqueta: '1er año',
        registrado_por: 'Fernanda Ochoa',
        registrado_at: '2026-11-01T13:32:00Z',
        es_nuevo: true,
      },
      { nombre: 'Sin id' },
    ],
  }

  it('maps the groups and the visitors of today, skipping rows without id', () => {
    expect(aDatosVivo(payload)).toEqual({
      ambitoId: 'a1',
      fecha: '2026-11-01',
      turnoId: 't1',
      grupos: [
        {
          grupoId: 'g1',
          nombre: '1er año · Chicas',
          subarea: 'Grupos de Chicas',
          anio: 1,
          anioEtiqueta: '1er año',
          lideres: ['Fernanda Ochoa', 'Diana Peraza'],
          presentes: 11,
          ausentes: 3,
          visitantes: 1,
          sinMarcar: 0,
        },
      ],
      visitantesHoy: [
        {
          personaId: 'p1',
          nombre: 'Emilia Rangel',
          grupoId: 'g1',
          grupo: '1er año · Chicas',
          anioEtiqueta: '1er año',
          registradoPor: 'Fernanda Ochoa',
          registradoAt: '2026-11-01T13:32:00Z',
          esNuevo: true,
        },
      ],
    })
  })

  it('reads missing or malformed fields as empty, never crashes', () => {
    expect(aDatosVivo(null)).toBeNull()
    expect(aDatosVivo([])).toBeNull()
    expect(aDatosVivo({ ambito_id: 'a1', fecha: '2026-11-01', turno_id: 't1' })).toEqual({
      ambitoId: 'a1',
      fecha: '2026-11-01',
      turnoId: 't1',
      grupos: [],
      visitantesHoy: [],
    })
    const grupo = aDatosVivo({ grupos: [{ grupo_id: 'g9', lideres: 'x', presentes: 'n' }] })?.grupos[0]
    expect(grupo).toMatchObject({ grupoId: 'g9', nombre: '', subarea: '', anio: null, lideres: [], presentes: 0, ausentes: 0, visitantes: 0, sinMarcar: 0 })
    const visitante = aDatosVivo({ visitantes_hoy: [{ persona_id: 'p2', nombre: 'Thiago', registrado_por: '' }] })?.visitantesHoy[0]
    expect(visitante).toMatchObject({ personaId: 'p2', nombre: 'Thiago', registradoPor: null, registradoAt: null, esNuevo: false })
  })
})
