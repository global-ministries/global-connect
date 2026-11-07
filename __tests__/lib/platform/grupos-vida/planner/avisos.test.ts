/**
 * Planner warnings (S2, S5, S7 of odd/tasks/planner-gdv.md): they never
 * block publishing; each one names its kind, groups, people and a short
 * Spanish message.
 */
import { calcularAvisos, esMatrimonios, MINIMO_PERSONAS_GRUPO, type Aviso, type TipoAviso } from '@/lib/platform/grupos-vida/planner'
import {
  IRIBARREN,
  LOCALIDADES,
  PENA,
  bancoDe,
  enGrupo,
  grupo,
  grupoCompleto,
  persona,
} from '@/lib/platform/grupos-vida/planner/__fixtures__/planner'
import type { GrupoTablero, PersonaBanco } from '@/lib/platform/grupos-vida/planner'

const avisos = (grupos: GrupoTablero[], banco: PersonaBanco[] = bancoDe(grupos), localidades = LOCALIDADES): Aviso[] =>
  calcularAvisos({ grupos, banco, localidades })

const deTipo = (lista: Aviso[], tipo: TipoAviso): Aviso[] => lista.filter((a) => a.tipo === tipo)

describe('esMatrimonios', () => {
  it.each(['Matrimonios', ' matrimonios ', 'MATRIMONIOS', 'Matrimonios Jóvenes'])('%s is Matrimonios', (nombre) => {
    expect(esMatrimonios(nombre)).toBe(true)
  })

  it.each(['Mujeres +36', 'Hombres', '', null, undefined])('%s is not Matrimonios', (nombre) => {
    expect(esMatrimonios(nombre)).toBe(false)
  })
})

describe('repite_lider', () => {
  it('flags a member whose leader of origin leads the group', () => {
    const g = grupoCompleto({
      lideres: [{ ...enGrupo('l1'), nombre: 'Carlos', apellido: 'Escalona' }, enGrupo('l2')],
      miembros: [{ ...enGrupo('m1', ['l1']), nombre: 'Ana' }, enGrupo('m2'), enGrupo('m3')],
    })
    expect(deTipo(avisos([g]), 'repite_lider')).toEqual([
      { tipo: 'repite_lider', grupoIds: ['g1'], personaIds: ['m1'], mensaje: 'Ana Pérez repite con su líder anterior: Carlos Escalona' },
    ])
  })

  it('flags an aprendiz too', () => {
    const g = grupoCompleto({ aprendices: [enGrupo('a1', ['l2'])] })
    expect(deTipo(avisos([g]), 'repite_lider').map((a) => a.personaIds)).toEqual([['a1']])
  })

  it('does not flag a leader, nor someone whose old leader is elsewhere', () => {
    const g = grupoCompleto({
      lideres: [enGrupo('l1', ['l2']), enGrupo('l2')],
      miembros: [enGrupo('m1', ['l9']), enGrupo('m2'), enGrupo('m3')],
    })
    expect(deTipo(avisos([g]), 'repite_lider')).toEqual([])
  })

  it('reports a couple in the group as one unit', () => {
    const g = grupoCompleto({
      lideres: [{ ...enGrupo('l1'), nombre: 'Carlos', apellido: 'Escalona' }, { ...enGrupo('l2'), nombre: 'María', apellido: 'Escalona' }],
      miembros: [{ ...enGrupo('m1', ['l1', 'l2']), nombre: 'Orlando' }, { ...enGrupo('m2', ['l1', 'l2']), nombre: 'Luisa' }, enGrupo('m3')],
    })
    const banco = bancoDe([g], [
      persona({ usuario_id: 'm1', nombre: 'Orlando', conyuge_id: 'm2' }),
      persona({ usuario_id: 'm2', nombre: 'Luisa', conyuge_id: 'm1' }),
    ])
    expect(deTipo(avisos([g], banco), 'repite_lider')).toEqual([
      {
        tipo: 'repite_lider',
        grupoIds: ['g1'],
        personaIds: ['m1', 'm2'],
        mensaje: 'Orlando y Luisa Pérez repiten con su líder anterior: Carlos Escalona y María Escalona',
      },
    ])
  })

  it('keeps one spouse alone when the other does not repeat', () => {
    const g = grupoCompleto({ miembros: [enGrupo('m1', ['l1']), enGrupo('m2'), enGrupo('m3')] })
    const banco = bancoDe([g], [persona({ usuario_id: 'm1', conyuge_id: 'm2' }), persona({ usuario_id: 'm2', conyuge_id: 'm1' })])
    expect(deTipo(avisos([g], banco), 'repite_lider').map((a) => a.personaIds)).toEqual([['m1']])
  })
})

describe('otra_ciudad and sin_direccion (S5)', () => {
  const g = grupoCompleto({ miembros: [{ ...enGrupo('m1'), nombre: 'Ana' }, enGrupo('m2'), enGrupo('m3')] })

  it('flags a person living in the municipio of another localidad', () => {
    const banco = bancoDe([g], [persona({ usuario_id: 'm1', nombre: 'Ana', municipio_id: IRIBARREN })])
    expect(deTipo(avisos([g], banco), 'otra_ciudad')).toEqual([
      { tipo: 'otra_ciudad', grupoIds: ['g1'], personaIds: ['m1'], mensaje: 'Ana Pérez vive en Iribarren y el grupo es de Cabudare' },
    ])
  })

  it('does not flag someone in the group municipio', () => {
    expect(deTipo(avisos([g]), 'otra_ciudad')).toEqual([])
  })

  it('does not flag Peña: no localidad lives there', () => {
    const banco = bancoDe([g], [persona({ usuario_id: 'm1', municipio_id: PENA })])
    const lista = avisos([g], banco)
    expect(deTipo(lista, 'otra_ciudad')).toEqual([])
    expect(deTipo(lista, 'sin_direccion')).toEqual([])
  })

  it('a person without municipio gets sin_direccion, not otra_ciudad', () => {
    const banco = bancoDe([g], [persona({ usuario_id: 'm1', nombre: 'Ana', municipio_id: null })])
    const lista = avisos([g], banco)
    expect(deTipo(lista, 'otra_ciudad')).toEqual([])
    expect(deTipo(lista, 'sin_direccion')).toEqual([
      { tipo: 'sin_direccion', grupoIds: ['g1'], personaIds: ['m1'], mensaje: 'Ana Pérez no tiene dirección' },
    ])
  })

  it('a group without localidad compares no city but still reports missing addresses', () => {
    const sinLocalidad = { ...g, localidad_id: null, localidad_nombre: null, localidad_municipio_id: null, localidad_municipio_nombre: null }
    const banco = bancoDe([sinLocalidad], [persona({ usuario_id: 'm1', municipio_id: IRIBARREN }), persona({ usuario_id: 'm2', municipio_id: null })])
    const lista = avisos([sinLocalidad], banco)
    expect(deTipo(lista, 'otra_ciudad')).toEqual([])
    expect(deTipo(lista, 'sin_direccion').map((a) => a.personaIds)).toEqual([['m2']])
  })

  it('checks the leaders too', () => {
    const banco = bancoDe([g], [persona({ usuario_id: 'l1', municipio_id: IRIBARREN })])
    expect(deTipo(avisos([g], banco), 'otra_ciudad').map((a) => a.personaIds)).toEqual([['l1']])
  })
})

describe('grupo_pequeno and sobre_cupo', () => {
  const conPersonas = (n: number, capacidad_maxima: number | null = 15): GrupoTablero =>
    grupo({
      capacidad_maxima,
      lideres: [enGrupo('l1')],
      aprendices: [enGrupo('a1')],
      miembros: Array.from({ length: Math.max(n - 2, 0) }, (_, i) => enGrupo(`m${i}`)),
    })

  it('uses 6 as the minimum', () => {
    expect(MINIMO_PERSONAS_GRUPO).toBe(6)
  })

  it('flags 5 people as small', () => {
    expect(deTipo(avisos([conPersonas(5)]), 'grupo_pequeno')).toEqual([
      { tipo: 'grupo_pequeno', grupoIds: ['g1'], personaIds: [], mensaje: 'Tiene 5 personas; lo mínimo son 6' },
    ])
  })

  it('exactly 6 people is not small', () => {
    expect(deTipo(avisos([conPersonas(6)]), 'grupo_pequeno')).toEqual([])
  })

  it('an empty group is small', () => {
    expect(deTipo(avisos([grupo()]), 'grupo_pequeno').map((a) => a.mensaje)).toEqual(['Todavía no tiene personas; lo mínimo son 6'])
  })

  it('counts a person once even if listed in two roles', () => {
    const g = grupo({ lideres: [enGrupo('x')], aprendices: [enGrupo('x')], miembros: [enGrupo('a'), enGrupo('b'), enGrupo('c'), enGrupo('d')] })
    expect(deTipo(avisos([g]), 'grupo_pequeno').map((a) => a.mensaje)).toEqual(['Tiene 5 personas; lo mínimo son 6'])
  })

  it('exactly the capacity is not over capacity; one more is', () => {
    expect(deTipo(avisos([conPersonas(8, 8)]), 'sobre_cupo')).toEqual([])
    expect(deTipo(avisos([conPersonas(9, 8)]), 'sobre_cupo')).toEqual([
      { tipo: 'sobre_cupo', grupoIds: ['g1'], personaIds: [], mensaje: 'Tiene 9 personas y su cupo es 8' },
    ])
  })

  it('a group without capacity is never over capacity', () => {
    expect(deTipo(avisos([conPersonas(40, null)]), 'sobre_cupo')).toEqual([])
  })
})

describe('sin_aprendices', () => {
  it('flags a group without aprendices only', () => {
    expect(deTipo(avisos([grupoCompleto({ aprendices: [] })]), 'sin_aprendices')).toEqual([
      { tipo: 'sin_aprendices', grupoIds: ['g1'], personaIds: [], mensaje: 'No tiene aprendices' },
    ])
    expect(deTipo(avisos([grupoCompleto()]), 'sin_aprendices')).toEqual([])
  })
})

describe('conyuge_separado (S2)', () => {
  const matrimonios = grupoCompleto({ grupo_id: 'g1', nombre: 'Grupo #14', segmento_id: 'seg-mat', segmento_nombre: 'Matrimonios' })
  const mujeres = grupoCompleto({ grupo_id: 'g2', nombre: 'Grupo Rosas', segmento_id: 'seg-muj', segmento_nombre: 'Mujeres +36' })
  const hombres = grupoCompleto({ grupo_id: 'g3', nombre: 'Grupo Roca', segmento_id: 'seg-hom', segmento_nombre: 'Hombres' })
  const pareja = (grupoA: GrupoTablero, grupoB: GrupoTablero): PersonaBanco[] => [
    persona({ usuario_id: 'h', nombre: 'Orlando', conyuge_id: 'm', grupo_actual_id: grupoA.grupo_id, grupo_actual_nombre: grupoA.nombre, grupo_actual_segmento_id: grupoA.segmento_id }),
    persona({ usuario_id: 'm', nombre: 'Luisa', conyuge_id: 'h', grupo_actual_id: grupoB.grupo_id, grupo_actual_nombre: grupoB.nombre, grupo_actual_segmento_id: grupoB.segmento_id }),
  ]

  it('flags once a couple with one spouse in Matrimonios and the other elsewhere', () => {
    const grupos = [matrimonios, mujeres]
    expect(deTipo(avisos(grupos, bancoDe(grupos, pareja(matrimonios, mujeres))), 'conyuge_separado')).toEqual([
      {
        tipo: 'conyuge_separado',
        grupoIds: ['g1', 'g2'],
        personaIds: ['h', 'm'],
        mensaje: 'Orlando y Luisa Pérez están separados: Grupo #14 (Matrimonios) y Grupo Rosas (Mujeres +36)',
      },
    ])
  })

  it('spouses in two groups outside Matrimonios is normal', () => {
    const grupos = [hombres, mujeres]
    expect(deTipo(avisos(grupos, bancoDe(grupos, pareja(hombres, mujeres))), 'conyuge_separado')).toEqual([])
  })

  it('spouses in two Matrimonios groups is not this warning', () => {
    const otro = { ...matrimonios, grupo_id: 'g4', nombre: 'Grupo #15' }
    const grupos = [matrimonios, otro]
    expect(deTipo(avisos(grupos, bancoDe(grupos, pareja(matrimonios, otro))), 'conyuge_separado')).toEqual([])
  })

  it('a spouse in the bank is not split', () => {
    const banco = pareja(matrimonios, mujeres).map((p) => (p.usuario_id === 'm' ? { ...p, grupo_actual_id: null, grupo_actual_nombre: null, grupo_actual_segmento_id: null } : p))
    expect(deTipo(avisos([matrimonios], bancoDe([matrimonios], banco)), 'conyuge_separado')).toEqual([])
  })

  it('uses the segment list for a group the actor does not see', () => {
    const banco = bancoDe([mujeres], pareja(matrimonios, mujeres))
    const lista = calcularAvisos({ grupos: [mujeres], banco, localidades: LOCALIDADES, segmentos: [{ id: 'seg-mat', nombre: 'Matrimonios' }] })
    expect(deTipo(lista, 'conyuge_separado').map((a) => a.grupoIds)).toEqual([['g1', 'g2']])
  })
})

describe('sin_ubicar and otra_temporada (bank)', () => {
  it('flags a person of the origin season without a group now', () => {
    const banco = [persona({ usuario_id: 'u1', nombre: 'Ana', origen_grupo_id: 'g-old', origen_grupo_nombre: 'Grupo Renacer', grupo_actual_id: null })]
    expect(deTipo(avisos([], banco), 'sin_ubicar')).toEqual([
      { tipo: 'sin_ubicar', grupoIds: [], personaIds: ['u1'], mensaje: 'Ana Pérez estaba en Grupo Renacer y todavía no tiene grupo' },
    ])
  })

  it('a new person or someone already placed is not sin_ubicar', () => {
    const banco = [
      persona({ usuario_id: 'nuevo', grupo_actual_id: null }),
      persona({ usuario_id: 'ubicado', origen_grupo_id: 'g-old', grupo_actual_id: 'g1' }),
    ]
    expect(deTipo(avisos([], banco), 'sin_ubicar')).toEqual([])
  })

  it('flags a placed person who is also in a group of another active season', () => {
    const banco = [
      persona({
        usuario_id: 'u1',
        nombre: 'Ana',
        otras_temporadas: [
          { temporada_id: 't1', temporada_nombre: '2026-I', grupo_id: 'g7', grupo_nombre: 'Grupo Luz' },
          { temporada_id: 't1', temporada_nombre: '2026-I', grupo_id: 'g8', grupo_nombre: 'Grupo Sal' },
        ],
      }),
    ]
    expect(deTipo(avisos([], banco), 'otra_temporada')).toEqual([
      { tipo: 'otra_temporada', grupoIds: ['g1'], personaIds: ['u1'], mensaje: 'Ana Pérez también está en Grupo Luz y Grupo Sal de 2026-I' },
    ])
  })

  it('an unplaced person active elsewhere is not warned (the bank row shows it)', () => {
    const banco = [persona({ usuario_id: 'u1', grupo_actual_id: null, otras_temporadas: [{ temporada_id: 't1', temporada_nombre: '2026-I', grupo_id: 'g7', grupo_nombre: 'Grupo Luz' }] })]
    expect(deTipo(avisos([], banco), 'otra_temporada')).toEqual([])
  })
})

describe('calcularAvisos', () => {
  it('a healthy group has no warnings', () => {
    expect(avisos([grupoCompleto()])).toEqual([])
  })
})
