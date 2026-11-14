/**
 * DPS e-mails (odd/tasks/dps-asistencia-pco.md, T16b; S14.1, S14.4, S14.6;
 * artboards design/dps-avisos-correo 01-04): the shared texts and styles of
 * the service notice and the planner's «No puedo». Dates come as
 * 'YYYY-MM-DD' (the plan's day), hours as 'HH:MM', instants in UTC and are
 * shown in Caracas. Pure.
 */
import { fechaHablada } from '@/lib/platform/dps/plan'
import { horariosTexto } from '@/lib/platform/dps/planilla'

export interface RolEmail {
  readonly nombre: string
  readonly equipo: string
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] as const

export const LINEA = '────────────────────────────'
export const MARCA = 'Dream Team · Global Barquisimeto'

export const mayuscula = (texto: string): string => texto.charAt(0).toLocaleUpperCase('es') + texto.slice(1)

/** «a», «a y b», «a, b y c». */
export function enLista(partes: readonly string[]): string {
  const p = partes.filter(Boolean)
  if (p.length < 2) return p[0] ?? ''
  return `${p.slice(0, -1).join(', ')} y ${p[p.length - 1]}`
}

/** «Domingo 15 de noviembre». */
export const fechaLarga = (fecha: string): string => mayuscula(fechaHablada(fecha))

/** «domingo 15». */
export function diaCorto(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  return `${DIAS[d.getUTCDay()] ?? ''} ${d.getUTCDate()}`
}

/** «15 nov». */
export function fechaAbreviada(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  return `${d.getUTCDate()} ${MESES_CORTOS[d.getUTCMonth()] ?? ''}`
}

export const esDomingo = (fecha: string): boolean => new Date(`${fecha}T00:00:00Z`).getUTCDay() === 0

/** «09:00» → «9:00». */
export const hora = (valor: string): string => valor.replace(/^0(\d)/, '$1')

/** ['09:00', '11:30'] → «9:00 y 11:30». */
export const horarios = (valores: readonly string[]): string => horariosTexto(valores)

/** The names of the roles: «Comunicador», «Comunicador y Host». */
export const nombresRoles = (roles: readonly RolEmail[]): string => enLista([...new Set(roles.map((r) => r.nombre).filter(Boolean))])

/** «Comunicador · Producción Creativa», «Comunicador y Host · Producción Creativa», or each with its equipo. */
export function rolesTexto(roles: readonly RolEmail[]): string {
  const equipos = [...new Set(roles.map((r) => r.equipo).filter(Boolean))]
  if (equipos.length <= 1) return [nombresRoles(roles), equipos[0] ?? ''].filter(Boolean).join(' · ')
  return enLista(roles.map((r) => [r.nombre, r.equipo].filter(Boolean).join(' · ')))
}

/** An instant as Caracas wall time: «jueves 12 de noviembre, 21:14» parts. */
export function enCaracas(instante: string): { fecha: string; hora: string; dia: string } | null {
  const d = new Date(instante)
  if (Number.isNaN(d.getTime())) return null
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? ''
  const fecha = `${p('year')}-${p('month')}-${p('day')}`
  return { fecha, hora: `${Number(p('hour'))}:${p('minute')}`, dia: diaCorto(fecha) }
}

/** «Jueves 12 de noviembre, 21:14». */
export function momentoLargo(instante: string): string {
  const c = enCaracas(instante)
  if (!c) return ''
  const d = new Date(`${c.fecha}T00:00:00Z`)
  return `${mayuscula(DIAS[d.getUTCDay()] ?? '')} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()] ?? ''}, ${c.hora}`
}

export const colores = {
  titulo: '#ffffff',
  texto: '#a0a0b0',
  tenue: '#6b7280',
  borde: 'rgba(255, 255, 255, 0.11)',
  fondoBloque: 'rgba(255, 255, 255, 0.03)',
  marca: '#D06D2D',
  exito: '#4ade80',
  aviso: '#fbbf24',
  peligro: '#f87171',
  neutro: '#9ca3af',
} as const

export const estilos = {
  marca: {
    fontSize: '12px',
    fontWeight: '600' as const,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: colores.tenue,
    margin: '0 0 8px',
  },
  titulo: { fontSize: '24px', fontWeight: '700' as const, color: colores.titulo, margin: '0 0 16px', lineHeight: '1.3' },
  texto: { fontSize: '15px', lineHeight: '1.6', color: colores.texto, margin: '0 0 16px' },
  seccion: {
    fontSize: '12px',
    fontWeight: '600' as const,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: colores.tenue,
    margin: '24px 0 8px',
  },
  bloque: { border: `1px solid ${colores.borde}`, borderRadius: '12px', margin: '0 0 16px', padding: '16px 18px' },
  estado: { fontSize: '13px', fontWeight: '500' as const, margin: '0 0 6px' },
  fecha: { fontSize: '17px', fontWeight: '700' as const, color: colores.titulo, margin: '0 0 2px' },
  serie: { fontSize: '13px', color: colores.tenue, margin: '0 0 12px' },
  etiqueta: { fontSize: '13px', color: colores.tenue, padding: '6px 12px 6px 0', verticalAlign: 'top' as const, width: '120px' },
  valor: { fontSize: '15px', color: colores.titulo, padding: '6px 0', verticalAlign: 'top' as const },
  cambio: { display: 'block' as const, fontSize: '11px', fontWeight: '600' as const, color: colores.aviso },
  antes: { color: colores.tenue, textDecoration: 'line-through' },
  sub: { display: 'block' as const, fontSize: '13px', color: colores.tenue },
  botonPrimario: {
    backgroundColor: colores.marca,
    color: '#ffffff',
    padding: '13px 20px',
    borderRadius: '10px',
    fontWeight: '600' as const,
    fontSize: '15px',
    textDecoration: 'none',
    display: 'block' as const,
    textAlign: 'center' as const,
  },
  botonSecundario: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    color: colores.titulo,
    border: '1px solid rgba(255, 255, 255, 0.16)',
    padding: '12px 20px',
    borderRadius: '10px',
    fontWeight: '600' as const,
    fontSize: '15px',
    textDecoration: 'none',
    display: 'block' as const,
    textAlign: 'center' as const,
  },
  pista: { fontSize: '13px', color: colores.tenue, margin: '8px 0 0' },
  enlace: { fontSize: '14px', fontWeight: '600' as const, color: colores.marca, textDecoration: 'none' },
  ayuda: { fontSize: '14px', lineHeight: '1.6', color: colores.texto, margin: '0 0 10px' },
  cita: { fontSize: '15px', color: colores.titulo, fontStyle: 'italic' as const, margin: '0' },
  pie: { fontSize: '12px', lineHeight: '1.5', color: colores.tenue, margin: '16px 0 0', textAlign: 'center' as const },
} as const
