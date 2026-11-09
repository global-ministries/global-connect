/**
 * The lists by position (odd/tasks/dps-asistencia-pco.md, T14b; S12.2,
 * S12.3): which list feeds each column of the programming sheet, who edits
 * each one, and how dps_lista_leer is read. Every name is fictitious.
 */
import { LISTA_DE_COLUMNA, LISTAS_DPS, leerListaDps, listasVacias } from '@/lib/platform/dps/listas'

const ID = '11111111-1111-4111-8111-111111111111'

describe('LISTAS_DPS', () => {
  it('are Productores, Hosts, Comunicadores and Cantantes, each with who edits it', () => {
    expect(LISTAS_DPS.map((l) => [l.id, l.etiqueta, l.columna])).toEqual([
      ['productores', 'Productores', 'productor'],
      ['hosts', 'Hosts', 'host'],
      ['comunicadores', 'Comunicadores', 'comunicador'],
      ['cantantes', 'Cantantes', 'cantantes'],
    ])
    expect(LISTAS_DPS.map((l) => l.quienEdita)).toEqual([
      'La arman la dirección de DPS y la de Producción Creativa.',
      'La arma la dirección de DPS.',
      'La arma la dirección de DPS. Un comunicador no tiene que servir en DPS.',
      'Se gestionan en Dream Team › Global Music › Cantantes: son quienes sirven ahí.',
    ])
    expect(LISTA_DE_COLUMNA).toEqual({ productor: 'productores', host: 'hosts', comunicador: 'comunicadores', cantantes: 'cantantes' })
  })
})

describe('leerListaDps', () => {
  it('reads the list, whether the caller edits it and its people', () => {
    expect(
      leerListaDps({ lista: 'hosts', puede_editar: true, personas: [{ persona_id: ID, nombre: 'Ana Pérez', iniciales: 'AP' }, { persona_id: 'x', nombre: 'Mala' }] }),
    ).toEqual({ lista: 'hosts', puedeEditar: true, personas: [{ personaId: ID, nombre: 'Ana Pérez', iniciales: 'AP' }] })
  })

  it('is null for an unknown list or a bad answer; puede_editar is false unless true', () => {
    expect(leerListaDps({ lista: 'bajistas', personas: [] })).toBeNull()
    expect(leerListaDps(null)).toBeNull()
    expect(leerListaDps({ lista: 'cantantes' })).toEqual({ lista: 'cantantes', puedeEditar: false, personas: [] })
  })

  it('listasVacias gives the four lists empty and read-only', () => {
    expect(listasVacias()).toEqual({
      productores: { lista: 'productores', puedeEditar: false, personas: [] },
      hosts: { lista: 'hosts', puedeEditar: false, personas: [] },
      comunicadores: { lista: 'comunicadores', puedeEditar: false, personas: [] },
      cantantes: { lista: 'cantantes', puedeEditar: false, personas: [] },
    })
  })
})
