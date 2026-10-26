/**
 * A dated shift reads "Por fechas" wherever a servicio's shifts are named
 * (Servidores and Mi equipo), never a weekly or biweekly text (T2 of
 * odd/tasks/tlr-calendario-servicios.md, S3).
 */
import { nombreConFrecuencia } from '@/lib/platform/dream-team/frecuencia-turno'
import { FILTROS_INICIALES, calcularVistaServidores } from '@/lib/platform/dream-team/servidores-vista'
import type { Turno } from '@/lib/platform/dream-team/turnos'
import { HOY, ID_DHAH, arbolServidores, fila } from '../../../../tests/helpers/servidores-conexion'

const T9 = '00000000-0000-4000-8000-000000000009'
const TLR = '00000000-0000-4000-8000-000000000010'

describe('nombreConFrecuencia', () => {
  it('names a dated shift "Por fechas", whatever frequency is stored', () => {
    expect(nombreConFrecuencia('The Living Room', undefined, '2026-10-08', 'fechas')).toBe('The Living Room · Por fechas')
    expect(
      nombreConFrecuencia('The Living Room', { frecuencia: 'quincenal', fechaAncla: '2026-10-04' }, '2026-10-08', 'fechas'),
    ).toBe('The Living Room · Por fechas')
  })

  it('keeps the weekly text of a weekly shift', () => {
    expect(nombreConFrecuencia('Domingo 9:00', undefined, '2026-10-08', 'semanal')).toBe('Domingo 9:00')
  })
})

describe('Servidores shift column', () => {
  it('reads "Por fechas" for a dated shift', () => {
    const turnos: Turno[] = [
      { id: T9, campusId: 'bqt', nombre: 'Domingo 9:00', diaSemana: 0, hora: '09:00', orden: 1, activo: true, tipo: 'semanal' },
      { id: TLR, campusId: 'bqt', nombre: 'The Living Room', diaSemana: 0, hora: '10:00', orden: 2, activo: true, tipo: 'fechas' },
    ]
    const v = calcularVistaServidores({
      filas: [fila('a', 'Ana', ID_DHAH, 'Voluntario', { turnoIds: [T9, TLR] })],
      arbol: arbolServidores,
      filtros: FILTROS_INICIALES,
      hoy: HOY,
      turnos,
    })
    expect(v.visibles[0]?.turnosTexto).toBe('Domingo 9:00, The Living Room · Por fechas')
  })
})
