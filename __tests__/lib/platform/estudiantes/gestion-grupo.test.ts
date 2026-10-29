/**
 * Rules of the group drawer (artboards 06 / 07): the leaders to choose (G9),
 * where a member can move, how the search box becomes RPC arguments, the age
 * of a The Living Room member and the escala hint of "Crear grupo".
 */
import {
  argumentosBusqueda,
  destinosMover,
  edadEn,
  lideresParaElegir,
  opcionesDonde,
  pistaEscala,
  subtituloLider,
} from '@/lib/platform/estudiantes/gestion-grupo'
import {
  CAMPUS,
  CAMPUS_OTRO,
  CHICAS,
  CHICOS,
  GRUPOS_TRANSIT,
  SUBAREAS_TRANSIT,
  TLR,
  TLR_CHICAS,
  grupo,
  persona,
  subarea,
} from '@/lib/platform/estudiantes/__fixtures__/grupos'

describe('lideresParaElegir', () => {
  const disponibles = [
    persona('pao', 'Paola Ruiz'),
    persona('car', 'Carmen Díaz', 'Entrenador'),
    persona('dia', 'Diana Peraza'),
    persona('fer', 'Fernanda Ochoa'),
  ]

  it('puts leaders first, free ones before busy ones, then A–Z, and says what each leads', () => {
    const opciones = lideresParaElegir(disponibles, GRUPOS_TRANSIT, 'g3')
    expect(opciones.map((o) => [o.nombre, o.lidera])).toEqual([
      ['Diana Peraza', []],
      ['Fernanda Ochoa', ['1er año · Chicas']],
      ['Paola Ruiz', ['2do año · Chicas']],
      ['Carmen Díaz', []],
    ])
    expect(subtituloLider(opciones[0])).toBe('Líder · sin grupo')
    expect(subtituloLider(opciones[2])).toBe('Líder · lidera 2do año · Chicas')
  })

  it('does not count the group being edited as another group', () => {
    const opciones = lideresParaElegir(disponibles, GRUPOS_TRANSIT, 'g2')
    expect(opciones.find((o) => o.nombre === 'Paola Ruiz')?.lidera).toEqual([])
  })
})

describe('destinosMover', () => {
  it('offers the active groups of the same ámbito and campus, the same sub-área first', () => {
    const otroCampus = grupo('x1', '2do año · Chicas', { campusId: CAMPUS_OTRO })
    const destinos = destinosMover([...GRUPOS_TRANSIT, otroCampus], GRUPOS_TRANSIT[1])
    expect(destinos.map((d) => d.etiqueta)).toEqual([
      '1er año · Chicas',
      '3er año · Chicas',
      'Grupos de Chicos › 1er año · Chicos',
      'Grupos de Chicos › 2do año · Chicos · mismo año',
    ])
  })
})

describe('argumentosBusqueda', () => {
  it('waits for three characters', () => {
    expect(argumentosBusqueda(' lu ')).toBeNull()
  })

  it('searches a cédula or a phone by digits', () => {
    expect(argumentosBusqueda('V-31.455.102')).toEqual({ p_cedula: 'V-31.455.102', p_telefono: 'V-31.455.102' })
    expect(argumentosBusqueda('0412 555 0187')).toEqual({ p_cedula: '0412 555 0187', p_telefono: '0412 555 0187' })
  })

  it('searches a full name otherwise', () => {
    expect(argumentosBusqueda('  Lucía Fernández ')).toEqual({ p_nombre: 'Lucía Fernández' })
  })
})

describe('edadEn', () => {
  it('counts whole years at a date', () => {
    expect(edadEn('2004-10-30', new Date('2026-10-29T12:00:00'))).toBe(21)
    expect(edadEn('2004-10-29', new Date('2026-10-29T12:00:00'))).toBe(22)
    expect(edadEn(null, new Date())).toBeNull()
  })
})

describe('opcionesDonde', () => {
  it('groups the manageable sub-áreas by ámbito, with their campuses', () => {
    const tlr = subarea(TLR_CHICAS, { ambitoId: TLR, ambito: 'The Living Room', experiencia: 'the_living_room', subarea: 'Grupos de Chicas' })
    const opciones = opcionesDonde([...SUBAREAS_TRANSIT, subarea(CHICAS, { campusId: CAMPUS_OTRO, campus: 'Cabudare' }), tlr])
    expect(opciones.map((a) => [a.ambito, a.subareas.map((s) => [s.subareaId, s.campus.map((c) => c.campusId)])])).toEqual([
      ['The Living Room', [[TLR_CHICAS, [CAMPUS]]]],
      [
        'Transit',
        [
          [CHICAS, [CAMPUS, CAMPUS_OTRO]],
          [CHICOS, [CAMPUS]],
        ],
      ],
    ])
  })
})

describe('pistaEscala', () => {
  it('names the campus scale and the años of the ámbito', () => {
    const escala = [
      { numero: 1, etiqueta: '1er año', ambitoId: 'a-transit' },
      { numero: 2, etiqueta: '2do año', ambitoId: 'a-transit' },
      { numero: 3, etiqueta: '3er año', ambitoId: 'a-transit' },
      { numero: 4, etiqueta: '4to año', ambitoId: 'a-inside' },
      { numero: 6, etiqueta: '6to año', ambitoId: 'a-inside' },
    ]
    expect(pistaEscala(escala, 'Barquisimeto', 'a-transit', 'Transit')).toBe(
      'Escala del campus Barquisimeto: 1er año a 6to año. Transit va de 1er año a 3er año.',
    )
    expect(pistaEscala([], 'Barquisimeto', 'a-transit', 'Transit')).toBe(
      'El campus Barquisimeto todavía no tiene escala escolar. Pídela a la dirección de Estudiantes.',
    )
  })
})
