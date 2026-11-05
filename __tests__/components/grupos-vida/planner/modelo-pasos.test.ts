/**
 * The pure step helpers of the board (T5b): the optimistic move, the spouse
 * plan of a move (S2), whether a move changes anything, deletable groups
 * (S22) and the relative save time.
 */
import { aplicarMovimiento, cambiaAlgo, haceCuanto, planearMovimiento, puedeEliminarGrupo } from '@/components/grupos-vida/planner/modelo'
import { bancoDe, enGrupo, grupo, persona } from '@/lib/platform/grupos-vida/planner/__fixtures__/planner'

const MAT = grupo({ grupo_id: 'g-mat', nombre: 'Matrimonios 1', miembros: [enGrupo('m1')] })
const MUJ = grupo({ grupo_id: 'g-muj', nombre: 'Rosas', segmento_id: 'seg-muj', segmento_nombre: 'Mujeres +36', miembros: [] })
const ANA = persona({ usuario_id: 'ana', nombre: 'Ana', conyuge_id: 'm1', genero: 'Femenino', grupo_actual_id: null, grupo_actual_nombre: null, grupo_actual_rol: null, grupo_actual_segmento_id: null, grupos_en_temporada: 0 })
const ESTADO = { grupos: [MAT, MUJ], banco: bancoDe([MAT, MUJ], [ANA]) }
const fichas = new Map(ESTADO.banco.map((p) => [p.usuario_id, p]))

describe('aplicarMovimiento', () => {
  it('takes the people out of every group, puts them in the role and updates their bank rows', () => {
    const r = aplicarMovimiento(ESTADO, { usuarioIds: ['m1'], grupoId: 'g-muj', rol: 'aprendiz' })

    expect(r.grupos.find((g) => g.grupo_id === 'g-mat')?.miembros).toEqual([])
    expect(r.grupos.find((g) => g.grupo_id === 'g-muj')?.aprendices.map((p) => p.usuario_id)).toEqual(['m1'])
    expect(r.banco.find((p) => p.usuario_id === 'm1')).toMatchObject({ grupo_actual_id: 'g-muj', grupo_actual_rol: 'Colíder', grupos_en_temporada: 1 })
  })

  it('sends people to the bank with a null group', () => {
    const r = aplicarMovimiento(ESTADO, { usuarioIds: ['m1'], grupoId: null, rol: null })

    expect(r.grupos.every((g) => g.miembros.length === 0)).toBe(true)
    expect(r.banco.find((p) => p.usuario_id === 'm1')).toMatchObject({ grupo_actual_id: null, grupos_en_temporada: 0 })
  })
})

describe('planearMovimiento (S2)', () => {
  it('brings the spouse into Matrimonios and leaves them elsewhere with the note', () => {
    expect(planearMovimiento(['ana'], MAT, fichas, null)).toEqual({ tipo: 'mover', usuarioIds: ['ana', 'm1'], aviso: null, nota: 'Van los dos: es un grupo de Matrimonios' })
    expect(planearMovimiento(['ana'], MUJ, fichas, null)).toEqual({ tipo: 'mover', usuarioIds: ['ana'], aviso: 'Su cónyuge no viene: sigue en Matrimonios 1', nota: null })
  })

  it('asks who goes for a couple row outside Matrimonios', () => {
    expect(planearMovimiento(['ana', 'm1'], MUJ, fichas, null)).toEqual({ tipo: 'elegir' })
    expect(planearMovimiento(['ana', 'm1'], MUJ, fichas, 'ana')).toMatchObject({ tipo: 'mover', usuarioIds: ['ana'] })
  })
})

describe('cambiaAlgo, puedeEliminarGrupo and haceCuanto', () => {
  it('skips a move that leaves everything as it is', () => {
    expect(cambiaAlgo(ESTADO, { usuarioIds: ['m1'], grupoId: 'g-mat', rol: 'miembro' })).toBe(false)
    expect(cambiaAlgo(ESTADO, { usuarioIds: ['m1'], grupoId: 'g-mat', rol: 'lider' })).toBe(true)
    expect(cambiaAlgo(ESTADO, { usuarioIds: ['ana'], grupoId: null, rol: null })).toBe(false)
  })

  it('only deletes a group that has not started (S22)', () => {
    expect(puedeEliminarGrupo({ activo: false, estado_ciclo: 'proximo' })).toBe(true)
    expect(puedeEliminarGrupo({ activo: true, estado_ciclo: 'proximo' })).toBe(false)
    expect(puedeEliminarGrupo({ activo: false, estado_ciclo: 'activo' })).toBe(false)
  })

  it('says how long ago it was saved', () => {
    expect(haceCuanto(0, 3_000)).toBe('ahora')
    expect(haceCuanto(0, 42_000)).toBe('hace 42 s')
    expect(haceCuanto(0, 180_000)).toBe('hace 3 min')
    expect(haceCuanto(0, 7_200_000)).toBe('hace 2 h')
    expect(haceCuanto(null, 1)).toBeNull()
  })
})
