import {
  EDAD_MAXIMA_NINOS_ANOS,
  enRangoNinos,
  mensajeDeErrorFamilia,
  padreNuevoVacio,
  validarPadreNuevo,
} from '@/lib/platform/ninos/familia'
import { agruparFamilias, parseFamilias, type FamiliaEncontrada } from '@/lib/platform/ninos/familias-vista'

function hijo(id: string, extra: Record<string, unknown> = {}) {
  return { id, nombre: id, apellido: 'P', fecha_nacimiento: '2021-01-01', genero: 'Otro', autorizados: [], ...extra }
}

describe('parseFamilias (N10)', () => {
  it('defaults tiene_ficha to true and padres to the matched parent', () => {
    const [f] = parseFamilias([{ id: 'p1', nombre: 'Ana', apellido: 'P', telefono: '1', cedula: null, hijos: [hijo('h1')] }])
    expect(f.hijos[0].tiene_ficha).toBe(true)
    expect(f.padres).toEqual([{ id: 'p1', nombre: 'Ana', apellido: 'P', telefono: '1' }])
  })

  it('keeps tiene_ficha false and the padres list from the RPC', () => {
    const [f] = parseFamilias([
      {
        id: 'p1',
        nombre: 'Ana',
        apellido: 'P',
        hijos: [hijo('h1', { tiene_ficha: false })],
        padres: [
          { id: 'p1', nombre: 'Ana', apellido: 'P', telefono: null },
          { id: 'p2', nombre: 'Luis', apellido: 'P', telefono: null },
        ],
      },
    ])
    expect(f.hijos[0].tiene_ficha).toBe(false)
    expect(f.padres.map((p) => p.id)).toEqual(['p1', 'p2'])
  })
})

describe('agruparFamilias', () => {
  const base = (id: string, hijos: string[], padres: string[]): FamiliaEncontrada =>
    parseFamilias([
      {
        id,
        nombre: id,
        apellido: 'P',
        hijos: hijos.map((h) => hijo(h)),
        padres: padres.map((p) => ({ id: p, nombre: p, apellido: 'P', telefono: null })),
      },
    ])[0]

  it('merges the two parents of the same children into one card', () => {
    const r = agruparFamilias([base('ana', ['h1', 'h2'], ['ana', 'luis']), base('luis', ['h1', 'h2'], ['luis', 'ana'])])
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('ana')
    expect(r[0].hijos.map((h) => h.id)).toEqual(['h1', 'h2'])
    expect(r[0].padres.map((p) => p.id)).toEqual(['ana', 'luis'])
  })

  it('merges partial overlaps and keeps every child once', () => {
    const r = agruparFamilias([base('ana', ['h1'], ['ana', 'luis']), base('luis', ['h1', 'h3'], ['luis', 'ana'])])
    expect(r).toHaveLength(1)
    expect(r[0].hijos.map((h) => h.id)).toEqual(['h1', 'h3'])
  })

  it('keeps unrelated families apart, and parents without children', () => {
    const r = agruparFamilias([base('ana', ['h1'], ['ana']), base('eva', ['h9'], ['eva']), base('sin', [], ['sin'])])
    expect(r.map((f) => f.id)).toEqual(['ana', 'eva', 'sin'])
  })
})

describe('validarPadreNuevo', () => {
  it('requires nombre, apellido, a valid phone and gender', () => {
    const r = validarPadreNuevo(padreNuevoVacio())
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.errores).toEqual([
        'El nombre es obligatorio.',
        'El apellido es obligatorio.',
        'El teléfono no es válido.',
        'El género es obligatorio.',
      ])
  })

  it('rejects an invalid email', () => {
    const r = validarPadreNuevo({ ...padreNuevoVacio(), nombre: 'Luis', apellido: 'P', telefono: '0414 555 1234', genero: 'Masculino', email: 'x@' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores).toEqual(['El correo no es válido.'])
  })

  it('builds the payload with optional fields as null', () => {
    const r = validarPadreNuevo({ ...padreNuevoVacio(), nombre: ' Luis ', apellido: 'P', telefono: '04145551234', genero: 'Masculino' })
    expect(r).toEqual({
      ok: true,
      payload: { nombre: 'Luis', apellido: 'P', telefono: '04145551234', genero: 'Masculino', cedula: null, email: null },
    })
  })
})

describe('mensajeDeErrorFamilia (N10 codes)', () => {
  it.each([
    ['ficha_existente', 'Este niño ya tiene ficha. Búscalo de nuevo.'],
    ['sin_padre', 'El niño no está vinculado a ningún representante.'],
    ['vinculo_invalido', 'Esa persona no puede ser padre o madre de este niño.'],
  ])('%s', (codigo, texto) => {
    expect(mensajeDeErrorFamilia({ message: codigo })).toBe(texto)
  })
})

describe('enRangoNinos (mirror of ninos_en_rango_edad)', () => {
  it('uses a 13-year limit', () => {
    expect(EDAD_MAXIMA_NINOS_ANOS).toBe(13)
  })

  it.each([
    ['2021-05-05', true],
    ['2013-10-09', true],
    ['2013-10-08', false],
    ['2006-01-01', false],
    ['2026-10-09', false],
    ['', false],
  ])('%s → %s on 2026-10-08', (fecha, esperado) => {
    expect(enRangoNinos(fecha, '2026-10-08')).toBe(esperado)
  })

  it('has Spanish copy for fuera_de_rango', () => {
    expect(mensajeDeErrorFamilia({ message: 'fuera_de_rango' })).toBe(
      'Solo se registran en Niños los menores de 13 años con fecha de nacimiento.',
    )
  })
})
