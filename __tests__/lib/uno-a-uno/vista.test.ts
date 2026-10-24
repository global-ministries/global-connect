/**
 * T4 (odd/tasks/uno-a-uno.md) — pure view helpers for "Mis 1 a 1": parsing
 * mis_uno_a_uno() rows, splitting them into sections and building the
 * dirigido picker (couples shown once). T7: the celebración and the
 * supervision rows (uno_a_uno_supervision, uno_a_uno_supervision_lideres).
 */

import {
  agruparUnoAUno,
  nombresDe,
  opcionesDirigidos,
  parsearLideresSupervision,
  parsearSupervision,
  parsearUnoAUno,
  vistaUnoAUno,
} from '@/lib/uno-a-uno/vista'

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
    celebracion: null,
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

  // S7.3: the celebración as mis_uno_a_uno sends it (leader side only).
  it('reads the celebración', () => {
    const [u] = parsearUnoAUno([fila({ estado: 'realizado', mi_lado: 'lider', celebracion: 'Se bautizó' })])
    expect(u.celebracion).toBe('Se bautizó')
  })

  it('leaves the celebración null when there is none', () => {
    expect(parsearUnoAUno([fila({})])[0].celebracion).toBeNull()
  })
})

function filaSupervision(over: Record<string, unknown>) {
  return {
    id: 's-1',
    estado: 'realizado',
    fecha_hora: '2026-10-10T14:00:00Z',
    lugar: 'Café Centro',
    lideres: [{ id: 'l-1', nombre: 'Ana', apellido: 'Pérez' }],
    dirigidos: [{ id: 'd-1', nombre: 'Luis', apellido: 'Gómez' }],
    resumen: 'Hablamos de su familia.',
    celebracion: 'Se bautizó',
    motivo_cancelacion: null,
    realizado_en: '2026-10-10T15:00:00Z',
    cancelado_en: null,
    ...over,
  }
}

// S7.2: who with whom, date, place, estado, resumen, celebración, motivo; never the private note.
describe('parsearSupervision', () => {
  it('types every visible field', () => {
    expect(parsearSupervision([filaSupervision({})])).toEqual([
      {
        id: 's-1',
        estado: 'realizado',
        fechaHora: '2026-10-10T14:00:00Z',
        lugar: 'Café Centro',
        lideres: [{ id: 'l-1', nombre: 'Ana', apellido: 'Pérez' }],
        dirigidos: [{ id: 'd-1', nombre: 'Luis', apellido: 'Gómez' }],
        resumen: 'Hablamos de su familia.',
        celebracion: 'Se bautizó',
        motivoCancelacion: null,
      },
    ])
  })

  it('never carries a nota_privada, even if a row had one', () => {
    const [u] = parsearSupervision([filaSupervision({ nota_privada: 'Secreto pastoral' })])
    expect(u).not.toHaveProperty('notaPrivada')
    expect(JSON.stringify(u)).not.toContain('Secreto pastoral')
  })

  it('keeps the database order and drops rows with an unknown estado', () => {
    const lista = parsearSupervision([
      filaSupervision({ id: 'b', fecha_hora: '2026-10-01T14:00:00Z' }),
      filaSupervision({ id: 'x', estado: 'raro' }),
      filaSupervision({ id: 'a', fecha_hora: '2026-10-09T14:00:00Z' }),
    ])
    expect(lista.map((u) => u.id)).toEqual(['b', 'a'])
  })

  it('returns an empty list for null', () => {
    expect(parsearSupervision(null)).toEqual([])
  })
})

// S7.4: per leader of the chain, in the database order (longest without a 1:1 first).
describe('parsearLideresSupervision', () => {
  it('types each leader and keeps the database order', () => {
    const lista = parsearLideresSupervision([
      {
        usuario_id: 'l-2',
        nombre: 'Pedro',
        apellido: 'Ruiz',
        contextos: ['GDV: Norte'],
        dirigidos: 3,
        realizados: 0,
        agendados: 1,
        ultimo_realizado: null,
      },
      {
        usuario_id: 'l-1',
        nombre: 'Ana',
        apellido: null,
        contextos: null,
        dirigidos: 2,
        realizados: 4,
        agendados: 0,
        ultimo_realizado: '2026-10-20T19:30:00Z',
      },
    ])
    expect(lista).toEqual([
      {
        usuarioId: 'l-2',
        nombre: 'Pedro',
        apellido: 'Ruiz',
        contextos: ['GDV: Norte'],
        dirigidos: 3,
        realizados: 0,
        agendados: 1,
        ultimoRealizado: null,
      },
      {
        usuarioId: 'l-1',
        nombre: 'Ana',
        apellido: null,
        contextos: [],
        dirigidos: 2,
        realizados: 4,
        agendados: 0,
        ultimoRealizado: '2026-10-20T19:30:00Z',
      },
    ])
  })

  it('drops rows without an id or a name', () => {
    expect(parsearLideresSupervision([{ usuario_id: null, nombre: 'X' }, { usuario_id: 'l-1' }])).toEqual([])
  })
})

// S7.1: the supervision view only for whoever supervises.
describe('vistaUnoAUno', () => {
  it('opens supervision when asked and the user supervises', () => {
    expect(vistaUnoAUno('supervision', true)).toBe('supervision')
    expect(vistaUnoAUno(['supervision', 'mis'], true)).toBe('supervision')
  })

  it.each([
    ['supervision', false],
    [undefined, true],
    ['otra', true],
  ] as const)('falls back to "mis" for %p (supervisa=%p)', (param, supervisa) => {
    expect(vistaUnoAUno(param, supervisa)).toBe('mis')
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
