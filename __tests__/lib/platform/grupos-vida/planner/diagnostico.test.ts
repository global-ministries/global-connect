/**
 * The closing diagnosis (T8b of odd/tasks/planner-gdv.md; S18, artboard 10
 * paso 3): how the season that closes ends, from planner_tablero(origen) and
 * planner_banco(origen). Groups (not cancelled), people, leaders, aprendices
 * (each person once), couples who lead the same group together, people who
 * could lead (aprendices who do not lead yet), the suggested number of
 * groups (current + floor(ready / 2)) and where the groups meet (localidad)
 * and the people live (municipio).
 */
import { diagnosticarCierre } from '@/lib/platform/grupos-vida/planner/diagnostico'
import { IRIBARREN, PENA, bancoDe, enGrupo, grupo, persona } from '@/lib/platform/grupos-vida/planner/__fixtures__/planner'

const escalona = grupo({
  grupo_id: 'g1',
  lideres: [enGrupo('esposo'), enGrupo('esposa')],
  aprendices: [enGrupo('a1'), enGrupo('a2')],
  miembros: [enGrupo('m1'), enGrupo('m2')],
})
const rosas = grupo({
  grupo_id: 'g2',
  nombre: 'Grupo Rosas',
  segmento_id: 'seg-muj',
  segmento_nombre: 'Mujeres +36',
  localidad_id: 'loc-bqto',
  localidad_nombre: 'Barquisimeto',
  lideres: [enGrupo('l3')],
  // a1 is aprendiz in two groups: counted once.
  aprendices: [enGrupo('a1'), enGrupo('a3')],
  miembros: [enGrupo('m3')],
})
const sinLocalidad = grupo({ grupo_id: 'g3', nombre: 'Grupo nuevo', localidad_id: null, localidad_nombre: null, lideres: [enGrupo('a2')], miembros: [enGrupo('m4')] })
const cancelado = grupo({ grupo_id: 'g4', nombre: 'Cancelado', estado_ciclo: 'cancelado', lideres: [enGrupo('x1')], miembros: [enGrupo('x2')] })

const GRUPOS = [escalona, rosas, sinLocalidad, cancelado]
const BANCO = bancoDe(GRUPOS, [
  persona({ usuario_id: 'esposo', conyuge_id: 'esposa' }),
  persona({ usuario_id: 'esposa', conyuge_id: 'esposo' }),
  persona({ usuario_id: 'l3', municipio_id: IRIBARREN }),
  persona({ usuario_id: 'm3', municipio_id: IRIBARREN }),
  persona({ usuario_id: 'm4', municipio_id: PENA }),
  persona({ usuario_id: 'a3', municipio_id: null }),
])

describe('diagnosticarCierre', () => {
  const d = diagnosticarCierre(GRUPOS, BANCO)

  it('counts groups without the cancelled ones and every person once', () => {
    expect(d.grupos).toBe(3)
    // esposo, esposa, a1, a2, m1, m2, l3, a3, m3, m4
    expect(d.integrantes).toBe(10)
    expect(d.lideres).toBe(4)
    expect(d.aprendices).toBe(3)
  })

  it('counts a couple leading the same group together once', () => {
    expect(d.parejasQueLideran).toBe(1)
  })

  it('people who could lead: aprendices of the closing season who do not lead a group', () => {
    // a2 already leads Grupo nuevo.
    expect(d.listosParaLiderar).toBe(2)
  })

  it('suggests the current groups plus one for every two aprendices ready', () => {
    expect(d.gruposSugeridos).toBe(4)
    const masListos = diagnosticarCierre([grupo({ aprendices: ['a', 'b', 'c', 'd', 'e'].map((u) => enGrupo(u)) })], [])
    expect(masListos).toMatchObject({ grupos: 1, listosParaLiderar: 5, gruposSugeridos: 3 })
  })

  it('groups by localidad, most first, "Sin localidad" last', () => {
    expect(d.porLocalidad).toEqual([
      { nombre: 'Barquisimeto', cantidad: 1 },
      { nombre: 'Cabudare', cantidad: 1 },
      { nombre: 'Sin localidad', cantidad: 1 },
    ])
  })

  it('people by the municipio where they live, "Sin dirección" last', () => {
    expect(d.dondeViven).toEqual([
      { nombre: 'Palavecino', cantidad: 6 },
      { nombre: 'Iribarren', cantidad: 2 },
      { nombre: 'Peña', cantidad: 1 },
      { nombre: 'Sin dirección', cantidad: 1 },
    ])
  })

  it('is all zeros for a season without groups', () => {
    expect(diagnosticarCierre([], [])).toEqual({
      grupos: 0,
      integrantes: 0,
      lideres: 0,
      aprendices: 0,
      parejasQueLideran: 0,
      listosParaLiderar: 0,
      gruposSugeridos: 0,
      porLocalidad: [],
      dondeViven: [],
    })
  })
})
