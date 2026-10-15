/**
 * T4 (odd/tasks/uno-a-uno.md) — pure view helpers for "Mis 1 a 1": parsing
 * mis_uno_a_uno() rows, splitting them into sections and building the
 * dirigido picker (couples shown once).
 */

import { agruparUnoAUno, nombresDe, opcionesDirigidos, parsearUnoAUno } from '@/lib/uno-a-uno/vista'

function fila(over: Record<string, unknown>) {
  return {
    id: 'u-1',
    estado: 'agendado',
    fecha_hora: '2026-10-20T14:00:00Z',
    lugar: null,
    mi_lado: 'lider',
    lideres: [{ id: 'l-1', nombre: 'Ana', apellido: 'Pérez' }],
    dirigidos: [{ id: 'd-1', nombre: 'Luis', apellido: 'Gómez' }],
    resumen: null,
    nota_privada: null,
    motivo_cancelacion: null,
    realizado_en: null,
    cancelado_en: null,
    ...over,
  }
}

describe('parsearUnoAUno', () => {
  it('keeps the well-formed people and drops malformed jsonb entries', () => {
    const [u] = parsearUnoAUno([
      fila({ dirigidos: [{ id: 'd-1', nombre: 'Luis', apellido: 'Gómez' }, 'basura', { nombre: 'sin id' }] }),
    ])
    expect(u.dirigidos).toEqual([{ id: 'd-1', nombre: 'Luis', apellido: 'Gómez' }])
    expect(u.miLado).toBe('lider')
  })

  it('drops rows with an unknown estado or lado', () => {
    expect(parsearUnoAUno([fila({ estado: 'raro' }), fila({ mi_lado: 'otro' })])).toEqual([])
  })

  it('returns an empty list for null', () => {
    expect(parsearUnoAUno(null)).toEqual([])
  })
})

describe('agruparUnoAUno', () => {
  it('sorts próximos ascending and realizados / cancelados descending', () => {
    const lista = parsearUnoAUno([
      fila({ id: 'a2', fecha_hora: '2026-10-22T14:00:00Z' }),
      fila({ id: 'a1', fecha_hora: '2026-10-21T14:00:00Z' }),
      fila({ id: 'r1', estado: 'realizado', fecha_hora: '2026-10-01T14:00:00Z' }),
      fila({ id: 'r2', estado: 'realizado', fecha_hora: '2026-10-05T14:00:00Z' }),
      fila({ id: 'c1', estado: 'cancelado', fecha_hora: '2026-09-01T14:00:00Z' }),
      fila({ id: 'c2', estado: 'cancelado', fecha_hora: '2026-09-09T14:00:00Z' }),
    ])
    const grupos = agruparUnoAUno(lista)
    expect(grupos.proximos.map((u) => u.id)).toEqual(['a1', 'a2'])
    expect(grupos.realizados.map((u) => u.id)).toEqual(['r2', 'r1'])
    expect(grupos.cancelados.map((u) => u.id)).toEqual(['c2', 'c1'])
  })
})

describe('nombresDe', () => {
  it('joins a couple with "y"', () => {
    expect(
      nombresDe([
        { id: '1', nombre: 'Ana', apellido: 'Pérez' },
        { id: '2', nombre: 'Luis', apellido: 'Gómez' },
      ]),
    ).toBe('Ana Pérez y Luis Gómez')
  })

  it('handles a missing apellido', () => {
    expect(nombresDe([{ id: '1', nombre: 'Ana', apellido: null }])).toBe('Ana')
  })
})

describe('opcionesDirigidos', () => {
  it('shows a couple once, with both names and every context', () => {
    const opciones = opcionesDirigidos([
      { usuario_id: 'd-1', nombre: 'Luis', apellido: 'Gómez', conyuge_id: 'd-2', contextos: ['GDV: Norte'] },
      { usuario_id: 'd-2', nombre: 'María', apellido: 'Gómez', conyuge_id: 'd-1', contextos: ['Dream Team: Sonido'] },
      { usuario_id: 'd-3', nombre: 'Pedro', apellido: 'Ruiz', conyuge_id: null, contextos: ['GDV: Norte'] },
    ])
    expect(opciones).toEqual([
      { valor: 'd-1', etiqueta: 'Luis Gómez y María Gómez — Dream Team: Sonido, GDV: Norte' },
      { valor: 'd-3', etiqueta: 'Pedro Ruiz — GDV: Norte' },
    ])
  })

  it('lists a dirigido whose spouse is not led on their own', () => {
    expect(
      opcionesDirigidos([{ usuario_id: 'd-1', nombre: 'Luis', apellido: 'Gómez', conyuge_id: 'x-9', contextos: [] }]),
    ).toEqual([{ valor: 'd-1', etiqueta: 'Luis Gómez' }])
  })
})
