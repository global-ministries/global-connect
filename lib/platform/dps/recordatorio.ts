/**
 * DPS — the automatic service reminder by e-mail, its configuration side
 * (odd/tasks/dps-asistencia-pco.md, T16c; S14.3; artboard
 * design/dps-avisos-correo 07). The database keeps the switch and the days
 * (dps_config, 1–7, default on and 2) and computes the preview: dps_config_leer
 * ().recordatorio and dps_recordatorio_guardar(activo, dias) answer the same
 * JSON (supabase/migrations/20261114110000_dps_avisos_recordatorio.sql). The
 * hour is fixed: the daily cron runs at 14:00 UTC, 10:00 in Caracas. Only
 * configurators save (puede_editar). Pure: safe on the client.
 */
import { MENSAJE_DIAS_RECORDATORIO } from './errores'

export const DIAS_RECORDATORIO_MIN = 1
export const DIAS_RECORDATORIO_MAX = 7
export const DIAS_RECORDATORIO_POR_DEFECTO = 2
export const HORA_RECORDATORIO = '10:00'

/** Who the next reminder reaches (people, not notices). */
export interface ProximoRecordatorio {
  /** The plan date, 'YYYY-MM-DD'. */
  readonly fecha: string
  /** The day it leaves (fecha − días), at 10:00. */
  readonly sale: string
  /** With an e-mail: they get it. */
  readonly personas: number
  /** Of those, still pendiente: the e-mail carries Confirmar / No puedo. */
  readonly conBotones: number
  /** Said «No puedo»: nothing. */
  readonly noPueden: number
  /** Without an e-mail in their ficha: nothing. */
  readonly sinCorreo: number
}

export interface UltimoRecordatorio {
  readonly fecha: string
  readonly enviados: number
  readonly total: number
}

export interface ConfigRecordatorio {
  readonly activo: boolean
  readonly dias: number
  readonly hora: string
  readonly puedeEditar: boolean
  /** null when it is off or there is no plan ahead. */
  readonly proximo: ProximoRecordatorio | null
  readonly ultimo: UltimoRecordatorio | null
}

type Objeto = Record<string, unknown>
const objeto = (v: unknown): Objeto | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Objeto) : null)
const numero = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const fecha = (v: unknown): string | null => (typeof v === 'string' && FECHA_RE.test(v) ? v : null)

export const esDiasRecordatorio = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= DIAS_RECORDATORIO_MIN && v <= DIAS_RECORDATORIO_MAX

function leerProximo(v: unknown): ProximoRecordatorio | null {
  const p = objeto(v)
  const f = p && fecha(p.fecha)
  const s = p && fecha(p.sale)
  if (!p || !f || !s) return null
  return { fecha: f, sale: s, personas: numero(p.personas), conBotones: numero(p.con_botones), noPueden: numero(p.no_pueden), sinCorreo: numero(p.sin_correo) }
}

function leerUltimo(v: unknown): UltimoRecordatorio | null {
  const u = objeto(v)
  const f = u && fecha(u.fecha)
  return u && f ? { fecha: f, enviados: numero(u.enviados), total: numero(u.total) } : null
}

/** Reads dps_config_leer().recordatorio / dps_recordatorio_guardar; null when it is not there. */
export function leerRecordatorio(data: unknown): ConfigRecordatorio | null {
  const d = objeto(data)
  if (!d) return null
  return {
    activo: d.activo !== false,
    dias: esDiasRecordatorio(d.dias) ? d.dias : DIAS_RECORDATORIO_POR_DEFECTO,
    hora: HORA_RECORDATORIO,
    puedeEditar: d.puede_editar === true,
    proximo: leerProximo(d.proximo),
    ultimo: leerUltimo(d.ultimo),
  }
}

/** 1 to 7 whole days (also checked by dps_recordatorio_guardar). */
export function validarDiasRecordatorio(v: unknown): { readonly ok: true; readonly dias: number } | { readonly ok: false; readonly mensaje: string } {
  return esDiasRecordatorio(v) ? { ok: true, dias: v } : { ok: false, mensaje: MENSAJE_DIAS_RECORDATORIO }
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const

/** '2026-11-13' → «viernes 13». */
function diaConNumero(f: string): string {
  const d = new Date(`${f}T00:00:00Z`)
  return `${DIAS_SEMANA[d.getUTCDay()] ?? ''} ${d.getUTCDate()}`
}

const palabra = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`

/** «2 días antes», «1 día antes». */
export const textoDias = (dias: number): string => `${palabra(dias, 'día', 'días')} antes`

/** «El próximo sale el viernes 13 a las 10:00 para el domingo 15: 31 personas». */
export function fraseProximo(p: ProximoRecordatorio): string {
  return `El próximo sale el ${diaConNumero(p.sale)} a las ${HORA_RECORDATORIO} para el ${diaConNumero(p.fecha)}: ${palabra(p.personas, 'persona', 'personas')}`
}

/** «El último salió el viernes 6 a las 10:00: 29 correos.» */
export function textoUltimo(u: UltimoRecordatorio): string {
  return `El último salió el ${diaConNumero(u.fecha)} a las ${HORA_RECORDATORIO}: ${palabra(u.enviados, 'correo', 'correos')}.`
}
