/**
 * «Mis servicios» — the texts of the person's services (odd/tasks/
 * dps-asistencia-pco.md, T15c, S13.4-S13.6; artboards design/dps-avisos
 * 04-07): dates, roles, horarios, the «Cambió tu servicio» before and after,
 * the conflicts of a blocked date and the person's part in the order. Pure:
 * safe on the client.
 */
import type { EstadoAviso, RolAviso, ServicioAviso } from '@/lib/platform/dps/avisos'
import { calcularOrden, type FilaOrden } from '@/lib/platform/dps/orden'
import { fechaHablada } from '@/lib/platform/dps/plan'
import { ETIQUETA_TIPO, horariosTexto, type TipoPlan } from '@/lib/platform/dps/planilla'
import { sumarDias } from '@/lib/platform/dps/programacion'
import type { TonoEstado } from '@/components/ui/punto-estado'

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const

const mayuscula = (texto: string): string => texto.charAt(0).toLocaleUpperCase('es') + texto.slice(1)
const partes = (fecha: string) => {
  const d = new Date(`${fecha}T00:00:00Z`)
  return { dia: d.getUTCDate(), mes: MESES_CORTOS[d.getUTCMonth()] ?? '' }
}

export const palabra = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios)

/** "Domingo 15 de noviembre". */
export const tituloFecha = (fecha: string): string => mayuscula(fechaHablada(fecha))

/** "Domingo 29 nov". */
export function fechaFila(fecha: string): string {
  const { dia, mes } = partes(fecha)
  return `${mayuscula(fechaHablada(fecha).split(' ')[0] ?? '')} ${dia} ${mes}`
}

/** The calendar tile: "Nov" and 29. */
export const mesYDia = (fecha: string): { mes: string; dia: number } => {
  const { dia, mes } = partes(fecha)
  return { mes: mayuscula(mes), dia }
}

/** "09:00" → "9:00". */
export const horaCorta = (hora: string): string => hora.replace(/^0(\d)/, '$1')

export const textoHorarios = (horarios: readonly string[]): string => horariosTexto(horarios)

/** "Comunicador", "Host y Cantantes". */
export function rolesTexto(roles: readonly RolAviso[]): string {
  const nombres = [...new Set(roles.map((r) => r.nombre).filter(Boolean))]
  if (nombres.length < 2) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

/** The área of the first role ("Producción Creativa"). */
export const areaRoles = (roles: readonly RolAviso[]): string => roles[0]?.direccion || roles[0]?.equipo || ''

/** "Tu casa tiene influencers · Semana 4", the plan's title, or its tipo when it is not a Sunday. */
export function contextoServicio(s: ServicioAviso): string {
  if (s.titulo) return s.titulo
  if (s.serie?.nombre) return s.semana ? `${s.serie.nombre} · Semana ${s.semana}` : s.serie.nombre
  return s.tipo && s.tipo !== 'domingo' ? (ETIQUETA_TIPO[s.tipo as TipoPlan] ?? '') : ''
}

/** "Domingo 29 nov · 11:30 · llegada 10:00". */
export function lineaServicio(s: ServicioAviso): string {
  return [fechaFila(s.fecha), textoHorarios(s.horarios), s.llegada ? `llegada ${horaCorta(s.llegada)}` : ''].filter(Boolean).join(' · ')
}

export const ETIQUETA_ESTADO: Record<EstadoAviso, string> = { pendiente: 'Pendiente de respuesta', confirmo: 'Confirmado', no_puede: 'No puedo' }
export const TONO_ESTADO: Record<EstadoAviso, TonoEstado> = { pendiente: 'warning', confirmo: 'success', no_puede: 'danger' }

/** What the person reads after answering. */
export function textoRespuesta(s: ServicioAviso, enDetalle: boolean): string {
  if (s.estado === 'confirmo') return enDetalle ? 'Confirmaste. Tu equipo ya lo ve.' : 'Gracias. Tu equipo ya lo ve.'
  if (s.estado === 'no_puede') return s.motivo ? `Avisamos a quien planifica: «${s.motivo}».` : 'Avisamos a quien planifica.'
  return ''
}

/** "Te avisó Andrés Valero hoy" / "ayer" / "el lunes 9". */
export function quienAviso(s: ServicioAviso, hoy: string): string {
  if (!s.enviadoAt) return ''
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(s.enviadoAt))
  const cuando = dia === hoy ? 'hoy' : dia === sumarDias(hoy, -1) ? 'ayer' : `el ${fechaHablada(dia).replace(/ de .*/, '')}`
  return s.enviadoPor ? `Te avisó ${s.enviadoPor} ${cuando}` : `Te avisaron ${cuando}`
}

/** «Ya no estás programado el domingo 22 de noviembre · Host». */
export function tituloQuitado(s: ServicioAviso): string {
  const roles = rolesTexto(s.roles)
  return `Ya no estás programado el ${fechaHablada(s.fecha)}${roles ? ` · ${roles}` : ''}`
}

export const tituloCambio = (s: ServicioAviso): string => `Cambió tu servicio del ${fechaHablada(s.fecha)}`

/** The sentences of «Cambió tu servicio»: only what changed, with the value it replaced. */
export function frasesCambio(s: ServicioAviso): { readonly ahora: string; readonly antes: string | null }[] {
  const frases: { ahora: string; antes: string | null }[] = []
  if (s.antes.fecha) frases.push({ ahora: `Ahora es el ${fechaHablada(s.fecha)}`, antes: fechaHablada(s.antes.fecha) })
  if (s.antes.roles) frases.push({ ahora: `Ahora sirves como ${rolesTexto(s.roles)}`, antes: rolesTexto(s.antes.roles) || null })
  if (s.antes.horarios) frases.push({ ahora: `Ahora sirves a las ${textoHorarios(s.horarios)}`, antes: textoHorarios(s.antes.horarios) || null })
  if (s.antes.llegada) frases.push({ ahora: `Llegada ${horaCorta(s.llegada)}`, antes: horaCorta(s.antes.llegada) })
  return frases
}

export function cierreCambio(s: ServicioAviso): string {
  if (s.estado === 'confirmo') return 'Sigues confirmado.'
  if (s.estado === 'no_puede') return 'Sigue tu respuesta «No puedo».'
  return 'Responde si puedes servir.'
}

/** «Ya estás programado como Host el domingo 15». */
export function textoConflicto(s: ServicioAviso): string {
  const { dia } = partes(s.fecha)
  const dow = fechaHablada(s.fecha).split(' ')[0] ?? ''
  const roles = rolesTexto(s.roles)
  return `Ya estás programado${roles ? ` como ${roles}` : ''} el ${dow} ${dia}`
}

// ── fechas bloqueadas ────────────────────────────────────────────────

/** The Sundays from desde to hasta, both included. */
export function domingosEntre(desde: string, hasta: string): string[] {
  const domingos: string[] = []
  if (!desde || !hasta || desde > hasta) return domingos
  const d = new Date(`${desde}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7))
  for (let f = d.toISOString().slice(0, 10); f <= hasta; f = sumarDias(f, 7)) domingos.push(f)
  return domingos
}

/** "Domingo 22 de noviembre" for one day, "Del 20 dic al 3 ene" for a range. */
export function tituloRango(desde: string, hasta: string): string {
  if (desde === hasta) return tituloFecha(desde)
  const a = partes(desde)
  const b = partes(hasta)
  return `Del ${a.dia} ${a.mes} al ${b.dia} ${b.mes}`
}

// ── orden del servicio ───────────────────────────────────────────────

export interface FilaOrdenPersona {
  readonly fila: FilaOrden
  /** The start in the first service, or null. */
  readonly hora: string | null
  readonly horas: readonly string[]
  readonly mia: boolean
}

export interface OrdenPersona {
  readonly filas: readonly FilaOrdenPersona[]
  readonly momentos: number
  readonly inicio: string | null
  readonly fin: string | null
  /** «Tu parte: Anuncios a las 9:05 y a las 11:35.» or null. */
  readonly parte: string | null
}

const normalizar = (texto: string): string => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es').trim()

/**
 * The order with the person's part: an item whose responsable names one of
 * their roles or their name. A guess on free text, so it only highlights.
 */
export function ordenDePersona(filas: readonly FilaOrden[], horarios: readonly string[], llegada: string, roles: readonly RolAviso[], nombre: string | null): OrdenPersona {
  const calculo = calcularOrden(filas, horarios, llegada)
  const claves = [...roles.map((r) => r.nombre), nombre ?? ''].map(normalizar).filter((c) => c.length > 1)
  const esMia = (f: FilaOrden): boolean => {
    if (f.tipo !== 'item' || !f.responsable) return false
    const responsable = normalizar(f.responsable)
    const nombres = responsable.split(/\s*(?:,|\/|·|\by\b)\s*/)
    return claves.some((c) => responsable === c || nombres.includes(c))
  }
  const resultado = calculo.filas.map((c): FilaOrdenPersona => {
    const horas = c.horas.filter((h): h is string => h !== null)
    return { fila: c.fila, hora: horas[0] ?? null, horas, mia: esMia(c.fila) }
  })
  const mias = resultado.filter((f) => f.mia)
  const parte =
    mias.length > 0
      ? `Tu parte: ${mias
          .map((f) => `${f.fila.titulo}${f.horas.length > 0 ? ` a las ${f.horas.join(' y a las ')}` : ''}`)
          .join('; ')}.`
      : null
  return {
    filas: resultado,
    momentos: resultado.filter((f) => f.fila.tipo === 'item').length,
    inicio: calculo.comienzos[0] ?? null,
    fin: calculo.servicioSeg > 0 ? (calculo.fines[0] ?? null) : null,
    parte,
  }
}
