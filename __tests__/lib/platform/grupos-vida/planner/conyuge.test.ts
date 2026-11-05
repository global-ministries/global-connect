/**
 * The spouse rule (S2 of odd/tasks/planner-gdv.md): the spouse moves along
 * only into a Matrimonios group; anywhere else only the person moves.
 */
import { mensajeConyugeQueSeQueda, personasAMover } from '@/lib/platform/grupos-vida/planner'

describe('personasAMover', () => {
  it('a Matrimonios group receives the couple', () => {
    expect(personasAMover('p', 'c', 'Matrimonios')).toEqual(['p', 'c'])
  })

  it('any other segment receives only the person', () => {
    expect(personasAMover('p', 'c', 'Mujeres +36')).toEqual(['p'])
    expect(personasAMover('p', 'c', null)).toEqual(['p'])
  })

  it('without spouse, or a self-reference, only the person', () => {
    expect(personasAMover('p', null, 'Matrimonios')).toEqual(['p'])
    expect(personasAMover('p', 'p', 'Matrimonios')).toEqual(['p'])
  })
})

describe('mensajeConyugeQueSeQueda', () => {
  const esposo = { genero: 'Masculino', grupo_actual_id: null, grupo_actual_nombre: null }

  it('says the husband stays in the bank', () => {
    expect(mensajeConyugeQueSeQueda({ conyuge: esposo, segmentoDestinoNombre: 'Mujeres +36', grupoDestinoId: 'g2' })).toBe(
      'Su esposo no viene: está en el banco',
    )
  })

  it('says where the wife stays', () => {
    const esposa = { genero: 'Femenino', grupo_actual_id: 'g7', grupo_actual_nombre: 'Grupo Rosas' }
    expect(mensajeConyugeQueSeQueda({ conyuge: esposa, segmentoDestinoNombre: 'Hombres', grupoDestinoId: 'g2' })).toBe(
      'Su esposa no viene: sigue en Grupo Rosas',
    )
  })

  it('uses cónyuge when the gender is unknown', () => {
    expect(mensajeConyugeQueSeQueda({ conyuge: { ...esposo, genero: null }, segmentoDestinoNombre: 'Hombres', grupoDestinoId: 'g2' })).toBe(
      'Su cónyuge no viene: está en el banco',
    )
  })

  it('says nothing for Matrimonios, without spouse, or when the spouse is already there', () => {
    expect(mensajeConyugeQueSeQueda({ conyuge: esposo, segmentoDestinoNombre: 'Matrimonios', grupoDestinoId: 'g2' })).toBeNull()
    expect(mensajeConyugeQueSeQueda({ conyuge: null, segmentoDestinoNombre: 'Hombres', grupoDestinoId: 'g2' })).toBeNull()
    expect(
      mensajeConyugeQueSeQueda({
        conyuge: { genero: 'Femenino', grupo_actual_id: 'g2', grupo_actual_nombre: 'Grupo Roca' },
        segmentoDestinoNombre: 'Hombres',
        grupoDestinoId: 'g2',
      }),
    ).toBeNull()
  })
})
