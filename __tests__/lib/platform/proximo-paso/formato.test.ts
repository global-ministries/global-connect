/**
 * T8 (odd/tasks/proximo-paso.md, L24.3) — how /proximo-paso, «¡Listo!» and
 * the home card say the date, the time and the place, and the calendar
 * files of the 4 Sundays (no new dependencies: an .ics data URL and Google
 * Calendar links).
 */
import {
  archivoIcs,
  cuandoYDonde,
  diasHasta,
  domingo,
  domingosDe,
  enlaceGoogleCalendar,
  enlaceIcs,
  eventosCalendario,
  horaLegible,
  mesCorto,
} from '@/lib/platform/proximo-paso/formato'
import type { EdicionProximoPaso } from '@/lib/platform/talleres/proximo-paso-registro'

const clases = [
  { numero: 1, tema: 'Sígueme', fecha: '2027-01-03' },
  { numero: 2, tema: 'Intimidad con Dios', fecha: '2027-01-10' },
  { numero: 3, tema: 'Compañerismo', fecha: '2027-01-17' },
  { numero: 4, tema: 'Influencia', fecha: '2027-01-24' },
]
const enero: EdicionProximoPaso = {
  id: 'ed-ene',
  nombre: 'Enero 2027',
  fechaInicio: '2027-01-03',
  fechaFin: '2027-01-24',
  cupoRestante: 30,
  clases,
  hora: '10:00',
  lugar: 'Auditorio principal',
  indicaciones: 'Entra por la puerta lateral.',
}
const sinDetalles: EdicionProximoPaso = { ...enero, hora: null, lugar: null, indicaciones: null }
const AHORA = new Date('2026-11-11T12:00:00Z')

describe('horaLegible', () => {
  it.each([
    ['10:00', '10:00 a. m.'],
    ['13:30', '1:30 p. m.'],
    ['00:15', '12:15 a. m.'],
    ['12:00', '12:00 p. m.'],
  ])('reads %s as %s, like the talleres notices', (hora, texto) => {
    expect(horaLegible(hora)).toBe(texto)
  })
})

describe('dates', () => {
  it('names the month and the Sunday without a timezone shift', () => {
    expect(mesCorto('2027-01-03')).toBe('Ene')
    expect(mesCorto('2026-12-27')).toBe('Dic')
    expect(domingo('2027-01-03')).toBe('domingo 3 de enero')
  })

  it('lists the 4 Sundays of one month, or each with its month', () => {
    expect(domingosDe(clases)).toBe('Domingos 3, 10, 17 y 24 de enero')
    expect(
      domingosDe([
        { numero: 1, tema: null, fecha: '2026-12-27' },
        { numero: 2, tema: null, fecha: '2027-01-03' },
      ]),
    ).toBe('Domingos 27 de diciembre y 3 de enero')
    expect(domingosDe([])).toBeNull()
  })

  it('counts the days until a date in Caracas', () => {
    expect(diasHasta('2026-11-11', '2027-01-03')).toBe(53)
    expect(diasHasta('2027-01-03', '2027-01-03')).toBe(0)
  })
})

describe('cuandoYDonde', () => {
  it('joins the time and the place that exist, and nothing when neither does', () => {
    expect(cuandoYDonde(enero)).toBe('10:00 a. m. · Auditorio principal')
    expect(cuandoYDonde({ ...enero, lugar: null })).toBe('10:00 a. m.')
    expect(cuandoYDonde({ ...enero, hora: null })).toBe('Auditorio principal')
    expect(cuandoYDonde(sinDetalles)).toBeNull()
  })
})

describe('calendar', () => {
  it('makes one event per clase with its name, time, place and notes', () => {
    expect(eventosCalendario(enero)).toEqual([
      {
        uid: 'proximo-paso-ed-ene-1@global',
        titulo: 'Próximo Paso · Clase 1: Sígueme',
        fecha: '2027-01-03',
        hora: '10:00',
        lugar: 'Auditorio principal',
        descripcion: 'Entra por la puerta lateral.',
      },
      expect.objectContaining({ titulo: 'Próximo Paso · Clase 2: Intimidad con Dios', fecha: '2027-01-10' }),
      expect.objectContaining({ titulo: 'Próximo Paso · Clase 3: Compañerismo', fecha: '2027-01-17' }),
      expect.objectContaining({ titulo: 'Próximo Paso · Clase 4: Influencia', fecha: '2027-01-24' }),
    ])
  })

  it('writes an .ics with the Caracas time in UTC (UTC-4, no daylight saving)', () => {
    const ics = archivoIcs(eventosCalendario(enero).slice(0, 1), AHORA)
    expect(ics.split('\r\n')).toEqual([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Global Connect//Proximo Paso//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:proximo-paso-ed-ene-1@global',
      'DTSTAMP:20261111T120000Z',
      'DTSTART:20270103T140000Z',
      'DTEND:20270103T160000Z',
      'SUMMARY:Próximo Paso · Clase 1: Sígueme',
      'LOCATION:Auditorio principal',
      'DESCRIPTION:Entra por la puerta lateral.',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ])
  })

  it('makes an all-day event without a time and leaves out the missing place', () => {
    const lineas = archivoIcs(eventosCalendario(sinDetalles).slice(0, 1), AHORA).split('\r\n')
    expect(lineas).toContain('DTSTART;VALUE=DATE:20270103')
    expect(lineas).toContain('DTEND;VALUE=DATE:20270104')
    expect(lineas.some((l) => l.startsWith('LOCATION') || l.startsWith('DESCRIPTION'))).toBe(false)
  })

  it('escapes commas, semicolons and line breaks', () => {
    const [evento] = eventosCalendario({ ...enero, lugar: 'Sede Norte, salón 2; piso 1', indicaciones: 'Llega temprano.\nTrae tu Biblia.' })
    const ics = archivoIcs([evento], AHORA)
    expect(ics).toContain('LOCATION:Sede Norte\\, salón 2\\; piso 1')
    expect(ics).toContain('DESCRIPTION:Llega temprano.\\nTrae tu Biblia.')
  })

  it('wraps the .ics in a data URL', () => {
    const url = enlaceIcs(eventosCalendario(enero), AHORA)
    expect(url.startsWith('data:text/calendar;charset=utf-8,')).toBe(true)
    expect(decodeURIComponent(url.slice('data:text/calendar;charset=utf-8,'.length))).toBe(archivoIcs(eventosCalendario(enero), AHORA))
  })

  it('links one clase to Google Calendar in Caracas time', () => {
    const url = new URL(enlaceGoogleCalendar(eventosCalendario(enero)[0]))
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(url.searchParams.get('action')).toBe('TEMPLATE')
    expect(url.searchParams.get('text')).toBe('Próximo Paso · Clase 1: Sígueme')
    expect(url.searchParams.get('dates')).toBe('20270103T100000/20270103T120000')
    expect(url.searchParams.get('ctz')).toBe('America/Caracas')
    expect(url.searchParams.get('location')).toBe('Auditorio principal')
    expect(url.searchParams.get('details')).toBe('Entra por la puerta lateral.')
  })

  it('links an all-day clase without a place to Google Calendar', () => {
    const url = new URL(enlaceGoogleCalendar(eventosCalendario(sinDetalles)[0]))
    expect(url.searchParams.get('dates')).toBe('20270103/20270104')
    expect(url.searchParams.has('location')).toBe(false)
    expect(url.searchParams.has('details')).toBe(false)
  })
})
