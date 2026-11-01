/**
 * The leader history of a group (C6a of odd/tasks/estudiantes-fase-b.md, L29):
 * the RPC rows read defensively, the past periods newest first, the
 * "ene 2025 – jun 2025" range in Caracas time and the collapsed list.
 */
import {
  LIDERES_ANTERIORES_VISIBLES,
  leerHistorialLideres,
  lideresAnteriores,
  mesAnio,
  rangoPeriodo,
  subtituloLiderAnterior,
  visiblesLideresAnteriores,
  type PeriodoLider,
} from '@/lib/platform/estudiantes/lideres-historial'

const periodo = (parcial: Partial<PeriodoLider>): PeriodoLider => ({
  servicioId: 's1',
  personaId: 'p1',
  nombre: 'Ana Pérez',
  rol: 'Líder',
  desde: '2025-01-15T12:00:00Z',
  hasta: '2025-06-20T12:00:00Z',
  cerradoPor: null,
  ...parcial,
})

describe('leerHistorialLideres', () => {
  it('maps the RPC rows and joins the name', () => {
    expect(
      leerHistorialLideres([
        {
          servicio_id: 's1',
          persona_id: 'p1',
          nombre: 'Ana',
          apellido: 'Pérez',
          rol: 'Líder',
          desde: '2025-01-15T12:00:00+00:00',
          hasta: null as unknown as string,
          cerrado_por_nombre: null as unknown as string,
        },
        {
          servicio_id: 's2',
          persona_id: 'p2',
          nombre: 'Bea',
          apellido: null as unknown as string,
          rol: 'Entrenador',
          desde: '2024-09-01T12:00:00+00:00',
          hasta: '2025-01-15T12:00:00+00:00',
          cerrado_por_nombre: 'Carla Ruiz',
        },
      ]),
    ).toEqual([
      { servicioId: 's1', personaId: 'p1', nombre: 'Ana Pérez', rol: 'Líder', desde: '2025-01-15T12:00:00+00:00', hasta: null, cerradoPor: null },
      {
        servicioId: 's2',
        personaId: 'p2',
        nombre: 'Bea',
        rol: 'Entrenador',
        desde: '2024-09-01T12:00:00+00:00',
        hasta: '2025-01-15T12:00:00+00:00',
        cerradoPor: 'Carla Ruiz',
      },
    ])
  })

  it('drops rows without ids or start and reads null as an empty list', () => {
    expect(leerHistorialLideres(null)).toEqual([])
    expect(
      leerHistorialLideres([
        { servicio_id: '', persona_id: 'p1', nombre: 'Ana', apellido: 'Pérez', rol: 'Líder', desde: '2025-01-15T12:00:00Z', hasta: '', cerrado_por_nombre: '' },
        { servicio_id: 's2', persona_id: 'p2', nombre: 'Bea', apellido: 'Ruiz', rol: 'Líder', desde: '', hasta: '', cerrado_por_nombre: '' },
      ]),
    ).toEqual([])
  })
})

describe('lideresAnteriores', () => {
  it('keeps only closed periods, the most recently closed first', () => {
    const actual = periodo({ servicioId: 'a', hasta: null })
    const vieja = periodo({ servicioId: 'b', hasta: '2024-12-01T12:00:00Z' })
    const reciente = periodo({ servicioId: 'c', hasta: '2025-08-01T12:00:00Z' })
    expect(lideresAnteriores([actual, vieja, reciente]).map((p) => p.servicioId)).toEqual(['c', 'b'])
  })

  it('breaks ties by the later start, then by name', () => {
    const hasta = '2025-08-01T12:00:00Z'
    const lista = [
      periodo({ servicioId: 'z', nombre: 'Zoe', desde: '2025-01-01T12:00:00Z', hasta }),
      periodo({ servicioId: 'b', nombre: 'Bea', desde: '2025-03-01T12:00:00Z', hasta }),
      periodo({ servicioId: 'a', nombre: 'Ana', desde: '2025-01-01T12:00:00Z', hasta }),
    ]
    expect(lideresAnteriores(lista).map((p) => p.servicioId)).toEqual(['b', 'a', 'z'])
  })

  it('keeps every period of a person who led twice', () => {
    const lista = [
      periodo({ servicioId: 's1', desde: '2024-01-01T12:00:00Z', hasta: '2024-06-01T12:00:00Z' }),
      periodo({ servicioId: 's1', desde: '2025-01-01T12:00:00Z', hasta: '2025-06-01T12:00:00Z' }),
    ]
    expect(lideresAnteriores(lista).map((p) => p.desde)).toEqual(['2025-01-01T12:00:00Z', '2024-01-01T12:00:00Z'])
  })
})

describe('mesAnio and rangoPeriodo', () => {
  it('writes the month and year in Caracas time', () => {
    expect(mesAnio('2025-01-15T12:00:00Z')).toBe('ene 2025')
    // 1 Feb 02:00 UTC is still 31 Jan in Caracas (UTC−4).
    expect(mesAnio('2025-02-01T02:00:00Z')).toBe('ene 2025')
    expect(mesAnio('2025-12-31T23:00:00Z')).toBe('dic 2025')
  })

  it('writes "desde – hasta", one month when both fall in it', () => {
    expect(rangoPeriodo('2024-09-01T12:00:00Z', '2025-06-20T12:00:00Z')).toBe('sep 2024 – jun 2025')
    expect(rangoPeriodo('2025-06-02T12:00:00Z', '2025-06-20T12:00:00Z')).toBe('jun 2025')
  })

  it('writes "desde …" for a current period', () => {
    expect(rangoPeriodo('2025-06-02T12:00:00Z', null)).toBe('desde jun 2025')
  })

  it('writes the rol and the range under the name', () => {
    expect(subtituloLiderAnterior(periodo({}))).toBe('Líder · ene 2025 – jun 2025')
  })
})

describe('visiblesLideresAnteriores', () => {
  const lista = Array.from({ length: 5 }, (_, i) => periodo({ servicioId: `s${i}` }))

  it('shows the first ones and counts the hidden ones while collapsed', () => {
    const { visibles, ocultos } = visiblesLideresAnteriores(lista, false)
    expect(visibles).toHaveLength(LIDERES_ANTERIORES_VISIBLES)
    expect(visibles.map((p) => p.servicioId)).toEqual(['s0', 's1', 's2'])
    expect(ocultos).toBe(2)
  })

  it('shows all when expanded or short', () => {
    expect(visiblesLideresAnteriores(lista, true)).toEqual({ visibles: lista, ocultos: 0 })
    expect(visiblesLideresAnteriores(lista.slice(0, 3), false)).toEqual({ visibles: lista.slice(0, 3), ocultos: 0 })
  })
})
