/**
 * Each plan's own horarios (odd/tasks/dps-asistencia-pco.md, S10, T13):
 * 'HH:MM' ⇄ seconds of the day, the short hour of the screen ("9:15"),
 * the checks of dps_plan_horarios_guardar (1 to 4 services, strictly
 * ascending, llegada not after the first one) and the next service that
 * "+ Servicio" proposes.
 */
import { MAX_SERVICIOS, horaCortaSegundos, segundosHora, siguienteHorario, validarHorarios } from '@/lib/platform/dps/horarios'

describe('segundosHora', () => {
  it.each([
    ['00:00', 0],
    ['07:00', 25200],
    ['09:15', 33300],
    ['19:00', 68400],
    ['23:59', 86340],
  ])('%s is %i seconds of the day', (hora, segundos) => {
    expect(segundosHora(hora)).toBe(segundos)
  })

  it.each(['9:15', '24:00', '12:60', '', 'ab:cd', '09:15:00', ' 09:15'])('%p is not a time', (hora) => {
    expect(segundosHora(hora)).toBeNull()
  })
})

describe('horaCortaSegundos', () => {
  it.each([
    [25200, '7:00'],
    [33300, '9:15'],
    [33300 + 59, '9:15'],
    [68400, '19:00'],
    [0, '0:00'],
    // Past midnight it wraps around the clock.
    [86400 + 1800, '0:30'],
  ])('%i reads %s', (segundos, texto) => {
    expect(horaCortaSegundos(segundos)).toBe(texto)
  })
})

describe('validarHorarios', () => {
  it('accepts one evening service (a Cena del Señor) and up to four', () => {
    expect(validarHorarios(['19:00'], '18:00')).toBeNull()
    expect(validarHorarios(['09:15', '11:15'], '07:00')).toBeNull()
    expect(validarHorarios(['08:00', '10:00', '12:00', '18:30'], '06:30')).toBeNull()
    expect(MAX_SERVICIOS).toBe(4)
  })

  it('accepts the llegada at the first service itself', () => {
    expect(validarHorarios(['10:00'], '10:00')).toBeNull()
  })

  it.each([
    [[], 'none'],
    [['08:00', '09:00', '10:00', '11:00', '12:00'], 'five'],
    [['11:15', '09:15'], 'unsorted'],
    [['09:15', '09:15'], 'repeated'],
    [['9:15'], 'a bad format'],
  ])('refuses %j (%s)', (horarios) => {
    expect(validarHorarios(horarios, '07:00')).toBe('horarios_invalidos')
  })

  it('refuses a missing llegada or one after the first service', () => {
    expect(validarHorarios(['19:00'], '')).toBe('llegada_invalida')
    expect(validarHorarios(['19:00', '21:00'], '19:30')).toBe('llegada_invalida')
  })
})

describe('siguienteHorario', () => {
  it('proposes two hours after the last service', () => {
    expect(siguienteHorario(['09:15'])).toBe('11:15')
    expect(siguienteHorario(['09:15', '11:15'])).toBe('13:15')
  })

  it('stops at the end of the day and at four services', () => {
    expect(siguienteHorario(['21:30'])).toBe('23:30')
    expect(siguienteHorario(['22:30'])).toBeNull()
    expect(siguienteHorario(['08:00', '10:00', '12:00', '14:00'])).toBeNull()
  })

  it('starts at the default first service when there is none', () => {
    expect(siguienteHorario([])).toBe('09:15')
  })
})
