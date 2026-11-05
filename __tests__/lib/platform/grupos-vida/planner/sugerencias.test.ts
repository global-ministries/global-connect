/**
 * Localidad and name suggestions and the computed group labels (S3, S4 of
 * odd/tasks/planner-gdv.md).
 */
import { etiquetaGrupo, nombreCompleto, sugerirLocalidad, sugerirNombre } from '@/lib/platform/grupos-vida/planner'
import {
  IRIBARREN,
  LOCALIDADES,
  PALAVECINO,
  PENA,
  enGrupo,
  grupo,
  persona,
} from '@/lib/platform/grupos-vida/planner/__fixtures__/planner'
import type { PersonaBanco } from '@/lib/platform/grupos-vida/planner'

const viven = (municipios: Record<string, string | null>): PersonaBanco[] =>
  Object.entries(municipios).map(([usuario_id, municipio_id]) => persona({ usuario_id, municipio_id }))

const ids = (prefijo: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${prefijo}${i}`)

describe('sugerirLocalidad', () => {
  it('uses the leaders when they agree and counts the rest', () => {
    const miembros = ids('m', 14)
    const g = grupo({ lideres: [enGrupo('l1'), enGrupo('l2')], miembros: miembros.map((id) => enGrupo(id)) })
    const banco = viven({
      l1: PALAVECINO,
      l2: PALAVECINO,
      ...Object.fromEntries(miembros.map((id, i) => [id, i < 9 ? PALAVECINO : IRIBARREN])),
    })
    expect(sugerirLocalidad(g, banco, LOCALIDADES)).toEqual({
      localidadId: 'loc-cab',
      nombre: 'Cabudare',
      motivo: 'los líderes y 9 de 14 viven en Palavecino',
    })
  })

  it('follows agreeing leaders even when most members live elsewhere', () => {
    const g = grupo({ lideres: [enGrupo('l1'), enGrupo('l2')], miembros: ids('m', 3).map((id) => enGrupo(id)) })
    const banco = viven({ l1: IRIBARREN, l2: IRIBARREN, m0: PALAVECINO, m1: PALAVECINO, m2: PALAVECINO })
    expect(sugerirLocalidad(g, banco, LOCALIDADES)).toEqual({
      localidadId: 'loc-bqto',
      nombre: 'Barquisimeto',
      motivo: 'los líderes viven en Iribarren',
    })
  })

  it('a single leader without other people', () => {
    const g = grupo({ lideres: [enGrupo('l1')] })
    expect(sugerirLocalidad(g, viven({ l1: PALAVECINO }), LOCALIDADES)?.motivo).toBe('el líder vive en Palavecino')
  })

  it('a leader without address does not break the agreement of the other', () => {
    const g = grupo({ lideres: [enGrupo('l1'), enGrupo('l2')], miembros: [enGrupo('m0')] })
    expect(sugerirLocalidad(g, viven({ l1: null, l2: PALAVECINO, m0: PALAVECINO }), LOCALIDADES)?.motivo).toBe(
      'el líder y 1 de 1 viven en Palavecino',
    )
  })

  it('leaders disagreeing: the majority of everyone decides', () => {
    const g = grupo({ lideres: [enGrupo('l1'), enGrupo('l2')], miembros: ids('m', 9).map((id) => enGrupo(id)) })
    const banco = viven({
      l1: PALAVECINO,
      l2: IRIBARREN,
      ...Object.fromEntries(ids('m', 9).map((id, i) => [id, i < 7 ? PALAVECINO : i < 8 ? IRIBARREN : null])),
    })
    expect(sugerirLocalidad(g, banco, LOCALIDADES)).toEqual({ localidadId: 'loc-cab', nombre: 'Cabudare', motivo: '8 de 11 viven en Palavecino' })
  })

  it('one person is enough, in singular', () => {
    const g = grupo({ miembros: [enGrupo('m0'), enGrupo('m1')] })
    expect(sugerirLocalidad(g, viven({ m0: IRIBARREN, m1: null }), LOCALIDADES)?.motivo).toBe('1 de 2 vive en Iribarren')
  })

  it('a tie between localidades suggests nothing', () => {
    const g = grupo({ lideres: [enGrupo('l1'), enGrupo('l2')], miembros: [enGrupo('m0'), enGrupo('m1')] })
    expect(sugerirLocalidad(g, viven({ l1: PALAVECINO, l2: IRIBARREN, m0: PALAVECINO, m1: IRIBARREN }), LOCALIDADES)).toBeNull()
  })

  it('without data (no addresses, only Peña, or empty) suggests nothing', () => {
    const g = grupo({ lideres: [enGrupo('l1')], miembros: [enGrupo('m0')] })
    expect(sugerirLocalidad(g, viven({ l1: null, m0: null }), LOCALIDADES)).toBeNull()
    expect(sugerirLocalidad(g, viven({ l1: PENA, m0: PENA }), LOCALIDADES)).toBeNull()
    expect(sugerirLocalidad(grupo(), [], LOCALIDADES)).toBeNull()
  })

  it('Peña residents count in the total but never win', () => {
    const g = grupo({ miembros: ids('m', 4).map((id) => enGrupo(id)) })
    expect(sugerirLocalidad(g, viven({ m0: PENA, m1: PENA, m2: PENA, m3: PALAVECINO }), LOCALIDADES)?.motivo).toBe('1 de 4 vive en Palavecino')
  })

  it('when a municipio has two localidades, takes the first by name', () => {
    const localidades = [...LOCALIDADES, { id: 'loc-agua', nombre: 'Agua Viva', municipio_id: PALAVECINO }]
    const g = grupo({ lideres: [enGrupo('l1')] })
    expect(sugerirLocalidad(g, viven({ l1: PALAVECINO }), localidades)).toMatchObject({ localidadId: 'loc-agua', nombre: 'Agua Viva' })
  })
})

describe('sugerirNombre', () => {
  it('starts at 1', () => {
    expect(sugerirNombre('Cabudare', 'Mujeres +36', [])).toBe('Cabudare Mujeres +36 - 1')
  })

  it('takes the highest number plus one, not the first gap', () => {
    expect(sugerirNombre('Cabudare', 'Hombres', ['Cabudare Hombres - 1', 'Cabudare Hombres - 2', 'Cabudare Hombres - 4'])).toBe('Cabudare Hombres - 5')
  })

  it('Matrimonios has no dash, as in production', () => {
    expect(sugerirNombre('Cabudare', 'Matrimonios', ['Cabudare Matrimonios 9', 'Cabudare Matrimonios - 3'])).toBe('Cabudare Matrimonios 10')
  })

  it('compares without case, accents or extra spaces', () => {
    expect(sugerirNombre('Barquisimeto', 'Jóvenes', ['  barquisimeto   JOVENES -  7 ', 'Grupo Luz'])).toBe('Barquisimeto Jóvenes - 8')
  })

  it('counts only the same localidad and segment', () => {
    expect(sugerirNombre('Cabudare', 'Hombres', ['Barquisimeto Hombres - 6', 'Cabudare Mujeres - 3', 'Cabudare Hombres Extra - 2'])).toBe('Cabudare Hombres - 1')
  })

  it('needs a localidad and a segment', () => {
    expect(sugerirNombre(null, 'Hombres', [])).toBeNull()
    expect(sugerirNombre('Cabudare', '  ', [])).toBeNull()
  })
})

describe('etiquetaGrupo and nombreCompleto (S4)', () => {
  const g = grupo({ nombre: 'Grupo #14 Los Escalona' })
  const sinLocalidad = grupo({ nombre: 'Grupo #14 Los Escalona', localidad_id: null, localidad_nombre: null })

  it('the label is segment · localidad', () => {
    expect(etiquetaGrupo(g)).toBe('Matrimonios · Cabudare')
    expect(etiquetaGrupo(sinLocalidad)).toBe('Matrimonios · Sin localidad')
  })

  it('the full name adds segment and localidad after the free name', () => {
    expect(nombreCompleto(g)).toBe('Grupo #14 Los Escalona · Matrimonios Cabudare')
    expect(nombreCompleto(sinLocalidad)).toBe('Grupo #14 Los Escalona · Matrimonios · Sin localidad')
  })

  it('does not repeat what the name already says', () => {
    expect(nombreCompleto(grupo({ nombre: 'Cabudare Matrimonios 10' }))).toBe('Cabudare Matrimonios 10')
  })

  it('an empty name shows only the label', () => {
    expect(nombreCompleto(grupo({ nombre: '  ' }))).toBe('Matrimonios · Cabudare')
  })
})
