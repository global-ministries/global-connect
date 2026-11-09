import type { SupabaseClient } from '@supabase/supabase-js'

import type { TurnoFila } from '@/lib/platform/ninos/checkin'
import { cargarTurnosDelServicio, fechaDelServicio, turnosDelServicio, type FechaDeTurno } from '@/lib/platform/ninos/turnos-servicio'

const domingo: TurnoFila[] = [
  { id: 't9', nombre: 'Domingo 9:00', hora: '09:00:00', orden: 1 },
  { id: 't11', nombre: 'Domingo 11:00', hora: '11:00:00', orden: 2 },
]

const campamento = { id: 'tc', nombre: 'Campamento', hora: '18:00:00', orden: 3 }

describe('fechaDelServicio', () => {
  it('keeps a valid date from the URL', () => {
    expect(fechaDelServicio('2026-10-07', '2026-10-05', [])).toBe('2026-10-07')
  })
  it('is today when a Niños event happens today', () => {
    expect(fechaDelServicio(undefined, '2026-10-07', ['2026-10-07', '2026-10-11'])).toBe('2026-10-07')
  })
  it('is the coming Sunday otherwise, as before', () => {
    expect(fechaDelServicio(undefined, '2026-10-07', [])).toBe('2026-10-11')
    expect(fechaDelServicio('2026-13-40', '2026-10-07', ['2026-10-11'])).toBe('2026-10-11')
    expect(fechaDelServicio(undefined, '2026-10-11', [])).toBe('2026-10-11')
  })
})

describe('turnosDelServicio', () => {
  const fechas: FechaDeTurno[] = [
    { fecha: '2026-10-07', hora: '19:30:00', turno: campamento },
    { fecha: '2026-10-08', hora: null, turno: { ...campamento, id: 'td' } },
    { fecha: '2026-10-07', hora: null, turno: { ...campamento, id: 'tf', nombre: 'Taller', orden: 4 } },
  ]

  it('adds the dated turnos planned on that date, with the date hour when set', () => {
    expect(turnosDelServicio(domingo, fechas, '2026-10-07')).toEqual([
      ...domingo,
      { id: 'tc', nombre: 'Campamento', hora: '19:30:00', orden: 3, tipo: 'fechas' },
      { id: 'tf', nombre: 'Taller', hora: '18:00:00', orden: 4, tipo: 'fechas' },
    ])
  })
  it('keeps the Sunday turnos exactly as they came', () => {
    const lista = turnosDelServicio(domingo, fechas, '2026-10-11')
    expect(lista).toEqual(domingo)
    expect(lista[0]).toBe(domingo[0])
  })
})

type Llamada = { tabla: string; select: string; filtros: unknown[][] }

/** A PostgREST stand-in: records each query and answers with the rows of its table. */
function clienteFalso(filas: Record<string, unknown[]>) {
  const llamadas: Llamada[] = []
  const cliente = {
    from(tabla: string) {
      const llamada: Llamada = { tabla, select: '', filtros: [] }
      llamadas.push(llamada)
      const q = {
        select(s: string) {
          llamada.select = s
          return q
        },
        then(ok: (r: { data: unknown[]; error: null }) => unknown) {
          return Promise.resolve({ data: filas[tabla] ?? [], error: null }).then(ok)
        },
      } as Record<string, unknown>
      for (const m of ['in', 'eq', 'gte', 'lte', 'order']) {
        q[m] = (...args: unknown[]) => {
          llamada.filtros.push([m, ...args])
          return q
        }
      }
      return q
    },
  }
  return { cliente: cliente as unknown as SupabaseClient, llamadas }
}

describe('cargarTurnosDelServicio', () => {
  const semanalQuery = {
    tabla: 'dream_team_turnos',
    select: 'id, nombre, hora, orden',
    filtros: [
      ['in', 'campus_id', ['c1']],
      ['eq', 'activo', true],
      ['eq', 'dia_semana', 0],
      ['eq', 'tipo', 'semanal'],
      ['order', 'orden'],
    ],
  }

  it('reads the Sunday turnos as before and nothing else applies without events', async () => {
    const { cliente, llamadas } = clienteFalso({ dream_team_turnos: domingo })
    await expect(cargarTurnosDelServicio(cliente, ['c1'], undefined, '2026-10-07')).resolves.toEqual({ turnos: domingo, fecha: '2026-10-11' })
    expect(llamadas[0]).toEqual(semanalQuery)
    expect(llamadas.map((l) => l.tabla)).toEqual(['dream_team_turnos', 'dream_team_turno_fechas'])
  })

  it('adds the active dated turnos of an active Niños horario planned that day', async () => {
    const { cliente, llamadas } = clienteFalso({
      dream_team_turnos: domingo,
      dream_team_turno_fechas: [
        { fecha: '2026-10-07', hora: '19:30:00', turno: { ...campamento, campus_id: 'c1', activo: true, tipo: 'fechas' } },
        { fecha: '2026-10-07', hora: null, turno: { ...campamento, id: 'tx', campus_id: 'c1', activo: true, tipo: 'fechas' } },
      ],
      ninos_evento_horarios: [{ turno_id: 'tc' }],
    })
    await expect(cargarTurnosDelServicio(cliente, ['c1'], undefined, '2026-10-07')).resolves.toEqual({
      turnos: [...domingo, { id: 'tc', nombre: 'Campamento', hora: '19:30:00', orden: 3, tipo: 'fechas' }],
      fecha: '2026-10-07',
    })
    const [, fechas, horarios] = llamadas
    expect(fechas.select).toContain('dream_team_turnos!inner(')
    expect(fechas.filtros).toEqual(
      expect.arrayContaining([
        ['in', 'turno.campus_id', ['c1']],
        ['eq', 'turno.activo', true],
        ['eq', 'turno.tipo', 'fechas'],
        ['gte', 'fecha', '2026-10-07'],
        ['lte', 'fecha', '2026-10-11'],
      ]),
    )
    expect(horarios.tabla).toBe('ninos_evento_horarios')
    expect(horarios.select).toContain('ninos_eventos!inner(')
    expect(horarios.filtros).toEqual(
      expect.arrayContaining([
        ['in', 'turno_id', ['tc', 'tx']],
        ['eq', 'activo', true],
        ['eq', 'evento.activo', true],
      ]),
    )
  })

  it('reads only the asked date when the URL has one', async () => {
    const { cliente, llamadas } = clienteFalso({ dream_team_turnos: domingo })
    await cargarTurnosDelServicio(cliente, ['c1'], '2026-10-14', '2026-10-07')
    expect(llamadas[1].filtros).toEqual(expect.arrayContaining([['gte', 'fecha', '2026-10-14'], ['lte', 'fecha', '2026-10-14']]))
  })

  it('queries nothing without campuses', async () => {
    const { cliente, llamadas } = clienteFalso({})
    await expect(cargarTurnosDelServicio(cliente, [], undefined, '2026-10-07')).resolves.toEqual({ turnos: [], fecha: '2026-10-11' })
    expect(llamadas).toEqual([])
  })
})
