import { tipoRelacionParaVista } from '@/lib/config/relaciones-familiares'

// Row convention: (usuario1, usuario2, tipo) means usuario2 is `tipo` of usuario1.
const CHILD = 'child-id'
const FATHER = 'father-id'

describe('tipoRelacionParaVista', () => {
  it('inverts a parent row when the viewed user is usuario2 (the parent sees a child)', () => {
    const row = { tipo_relacion: 'padre', usuario1_id: CHILD, usuario2_id: FATHER }
    expect(tipoRelacionParaVista(row, FATHER)).toBe('hijo')
  })

  it('keeps the stored type when the viewed user is usuario1', () => {
    const row = { tipo_relacion: 'padre', usuario1_id: CHILD, usuario2_id: FATHER }
    expect(tipoRelacionParaVista(row, CHILD)).toBe('padre')
  })

  it('inverts a child row when the viewed user is usuario2', () => {
    const row = { tipo_relacion: 'hijo', usuario1_id: FATHER, usuario2_id: CHILD }
    expect(tipoRelacionParaVista(row, CHILD)).toBe('padre')
  })

  it.each(['conyuge', 'hermano', 'otro_familiar'])('never inverts the reciprocal type %s', (tipo) => {
    const row = { tipo_relacion: tipo, usuario1_id: 'a', usuario2_id: 'b' }
    expect(tipoRelacionParaVista(row, 'b')).toBe(tipo)
    expect(tipoRelacionParaVista(row, 'a')).toBe(tipo)
  })

  it('keeps a non-invertible type unchanged when the viewed user is usuario2', () => {
    const row = { tipo_relacion: 'abuelo', usuario1_id: 'a', usuario2_id: 'b' }
    expect(tipoRelacionParaVista(row, 'b')).toBe('abuelo')
  })

  it('still honors an explicit sentido = inverso', () => {
    const row = { tipo_relacion: 'padre', sentido: 'inverso' }
    expect(tipoRelacionParaVista(row, 'whoever')).toBe('hijo')
  })

  it('does not invert an explicit sentido = directo even for usuario2', () => {
    const row = { tipo_relacion: 'padre', sentido: 'directo', usuario1_id: CHILD, usuario2_id: FATHER }
    expect(tipoRelacionParaVista(row, FATHER)).toBe('padre')
  })
})
