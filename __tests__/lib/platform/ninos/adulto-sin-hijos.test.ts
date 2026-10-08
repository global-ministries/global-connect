import { hijosParaVincular, parseFamilias } from '@/lib/platform/ninos/familias-vista'

const adulto = {
  id: 'a1', nombre: 'Adela', apellido: 'Ruiz', telefono: '•••0951', cedula: '•••0951', hijos: [],
  padres: [{ id: 'a1', nombre: 'Adela', apellido: 'Ruiz', telefono: '•••0951' }], sin_hijos: true,
}
const hijo = (id: string, nombre: string) => ({ id, nombre, apellido: 'Ruiz', tiene_ficha: true, autorizados: [] })

describe('parseFamilias with an adult without children (N11)', () => {
  it('keeps sin_hijos true and zero children', () => {
    const [f] = parseFamilias([adulto])
    expect(f.sin_hijos).toBe(true)
    expect(f.hijos).toEqual([])
  })

  it('defaults sin_hijos to false for ordinary families', () => {
    const [f] = parseFamilias([{ ...adulto, sin_hijos: undefined, hijos: [hijo('h1', 'Lia')] }])
    expect(f.sin_hijos).toBe(false)
  })
})

describe('hijosParaVincular', () => {
  it('lists each child once and skips the adult\'s own children', () => {
    const familias = parseFamilias([
      { ...adulto, id: 'p1', sin_hijos: false, hijos: [hijo('h1', 'Lia'), hijo('h2', 'Eva')] },
      { ...adulto, id: 'p2', sin_hijos: false, hijos: [hijo('h1', 'Lia')] },
      { ...adulto, id: 'a1', sin_hijos: false, hijos: [hijo('h3', 'Ya vinculado')] },
      adulto,
    ])
    expect(hijosParaVincular(familias, 'a1').map((h) => h.id)).toEqual(['h1', 'h2'])
  })
})
