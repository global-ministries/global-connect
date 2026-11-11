/**
 * T8 (odd/tasks/proximo-paso.md, L24.3) — how Próximo Paso says when and
 * where: the dates of the 4 Sundays, the time of the clases, the place, and
 * the calendar files («Agregar a mi calendario»). Pure and server-safe; no
 * new dependencies: an .ics data URL and Google Calendar links.
 *
 * Dates are YYYY-MM-DD calendar days, never shifted by a timezone. Times are
 * HH:MM in Caracas (UTC-4 all year, no daylight saving), so the .ics writes
 * them in UTC by adding 4 hours. Nothing is invented: a missing time makes
 * an all-day event, a missing place or notes leave their line out.
 */
import { fechaDomingo, type ClaseProximoPaso, type EdicionProximoPaso } from '@/lib/platform/talleres/proximo-paso-registro'

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** Caracas is UTC-4 all year. */
const DESFASE_CARACAS_H = 4
/** The calendar block of one clase; the RPC carries no duration. */
export const DURACION_CLASE_H = 2

const partes = (iso: string): [number, number, number] => {
  const [a, m, d] = iso.split('-').map(Number)
  return [a, m, d]
}

/** "10:00 a. m." for "10:00", the same words as the talleres notices (talleres_aviso_hora). */
export function horaLegible(hora: string): string {
  const [h, m] = hora.split(':').map(Number)
  const sufijo = h < 12 ? 'a. m.' : 'p. m.'
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${sufijo}`
}

/** "Ene" for a YYYY-MM-DD date. */
export function mesCorto(iso: string): string {
  return MESES_CORTOS[partes(iso)[1] - 1] ?? ''
}

/** The day of the month of a YYYY-MM-DD date. */
export function diaDelMes(iso: string): number {
  return partes(iso)[2]
}

/** "domingo 3 de enero". */
export function domingo(iso: string): string {
  return `domingo ${fechaDomingo(iso)}`
}

const unir = (items: readonly string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`

/** "Domingos 3, 10, 17 y 24 de enero"; each with its month when they span two. */
export function domingosDe(clases: readonly ClaseProximoPaso[]): string | null {
  if (clases.length === 0) return null
  const meses = new Set(clases.map((c) => partes(c.fecha)[1]))
  if (meses.size === 1) {
    const mes = MESES[partes(clases[0].fecha)[1] - 1]
    return `Domingos ${unir(clases.map((c) => String(diaDelMes(c.fecha))))} de ${mes}`
  }
  return `Domingos ${unir(clases.map((c) => fechaDomingo(c.fecha)))}`
}

const diaUtc = (iso: string): number => {
  const [a, m, d] = partes(iso)
  return Date.UTC(a, m - 1, d)
}

/** Whole days from `hoy` to `fecha` (both YYYY-MM-DD in Caracas). */
export function diasHasta(hoy: string, fecha: string): number {
  return Math.round((diaUtc(fecha) - diaUtc(hoy)) / 86_400_000)
}

/** "10:00 a. m. · Auditorio principal" with what exists; null when neither does. */
export function cuandoYDonde(e: Pick<EdicionProximoPaso, 'hora' | 'lugar'>): string | null {
  const partesTexto = [e.hora ? horaLegible(e.hora) : null, e.lugar].filter((p): p is string => Boolean(p))
  return partesTexto.length > 0 ? partesTexto.join(' · ') : null
}

export interface EventoCalendario {
  readonly uid: string
  readonly titulo: string
  /** YYYY-MM-DD */
  readonly fecha: string
  /** HH:MM in Caracas; null = all-day. */
  readonly hora: string | null
  readonly lugar: string | null
  readonly descripcion: string | null
}

/** One event per clase of the edición. */
export function eventosCalendario(e: EdicionProximoPaso): EventoCalendario[] {
  return e.clases.map((c) => ({
    uid: `proximo-paso-${e.id}-${c.numero}@global`,
    titulo: `Próximo Paso · Clase ${c.numero}${c.tema ? `: ${c.tema}` : ''}`,
    fecha: c.fecha,
    hora: e.hora,
    lugar: e.lugar,
    descripcion: e.indicaciones,
  }))
}

const dos = (n: number) => String(n).padStart(2, '0')

/** YYYYMMDDTHHMMSS of a UTC Date. */
const sello = (d: Date) =>
  `${d.getUTCFullYear()}${dos(d.getUTCMonth() + 1)}${dos(d.getUTCDate())}T${dos(d.getUTCHours())}${dos(d.getUTCMinutes())}${dos(d.getUTCSeconds())}`

const diaCompacto = (ms: number) => sello(new Date(ms)).slice(0, 8)

/** Start and end of a timed clase as UTC Dates (Caracas + 4 h). */
function inicioYFin(fecha: string, hora: string): [Date, Date] {
  const [h, m] = hora.split(':').map(Number)
  const inicio = new Date(diaUtc(fecha) + ((h + DESFASE_CARACAS_H) * 60 + m) * 60_000)
  return [inicio, new Date(inicio.getTime() + DURACION_CLASE_H * 3_600_000)]
}

/** RFC 5545 text: backslash, comma, semicolon and line breaks escaped. */
const escapar = (texto: string) => texto.replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n')

/** An .ics calendar with the events; `ahora` stamps it. */
export function archivoIcs(eventos: readonly EventoCalendario[], ahora: Date = new Date()): string {
  const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Global Connect//Proximo Paso//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
  for (const ev of eventos) {
    lineas.push('BEGIN:VEVENT', `UID:${ev.uid}`, `DTSTAMP:${sello(ahora)}Z`)
    if (ev.hora) {
      const [inicio, fin] = inicioYFin(ev.fecha, ev.hora)
      lineas.push(`DTSTART:${sello(inicio)}Z`, `DTEND:${sello(fin)}Z`)
    } else {
      lineas.push(`DTSTART;VALUE=DATE:${diaCompacto(diaUtc(ev.fecha))}`, `DTEND;VALUE=DATE:${diaCompacto(diaUtc(ev.fecha) + 86_400_000)}`)
    }
    lineas.push(`SUMMARY:${escapar(ev.titulo)}`)
    if (ev.lugar) lineas.push(`LOCATION:${escapar(ev.lugar)}`)
    if (ev.descripcion) lineas.push(`DESCRIPTION:${escapar(ev.descripcion)}`)
    lineas.push('END:VEVENT')
  }
  lineas.push('END:VCALENDAR', '')
  return lineas.join('\r\n')
}

/** The .ics as a data URL for an `<a download>`. */
export function enlaceIcs(eventos: readonly EventoCalendario[], ahora: Date = new Date()): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(archivoIcs(eventos, ahora))}`
}

/** "Add to Google Calendar" for one clase, in Caracas time. */
export function enlaceGoogleCalendar(ev: EventoCalendario): string {
  const p = new URLSearchParams({ action: 'TEMPLATE', text: ev.titulo })
  if (ev.hora) {
    const [h, m] = ev.hora.split(':').map(Number)
    const dia = diaCompacto(diaUtc(ev.fecha))
    const fin = h * 60 + m + DURACION_CLASE_H * 60
    p.set('dates', `${dia}T${dos(h)}${dos(m)}00/${dia}T${dos(Math.floor(fin / 60))}${dos(fin % 60)}00`)
    p.set('ctz', 'America/Caracas')
  } else {
    p.set('dates', `${diaCompacto(diaUtc(ev.fecha))}/${diaCompacto(diaUtc(ev.fecha) + 86_400_000)}`)
  }
  if (ev.lugar) p.set('location', ev.lugar)
  if (ev.descripcion) p.set('details', ev.descripcion)
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}
