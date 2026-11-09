/**
 * Niños › Eventos (odd/tasks/ninos-checkin-pco.md, T1c, S5, S8): the events of
 * a campus, their horarios and check-in window, as /ninos/eventos shows them.
 *
 * The data comes from ninos_eventos_admin and the writes go through the
 * ninos_evento_* / ninos_horario_* RPCs
 * (supabase/migrations/20261108100000_ninos_eventos.sql). They are not in the
 * generated types yet, so this file reads their JSON by hand and the RPCs are
 * called with an untyped client (as lib/platform/ninos/turnos-servicio.ts).
 * The hour of a horario lives in its Dream Team turno (S8.2): Niños only sets
 * when the check-in opens and when the pickup closes, in minutes.
 * Errors: the RPC message is a short code and its HINT a Spanish sentence,
 * shown as is.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export const TIPOS_EVENTO = ['semanal', 'diario', 'unico'] as const
export type TipoEvento = (typeof TIPOS_EVENTO)[number]

export interface HorarioEvento {
  readonly id: string
  readonly turnoId: string
  readonly nombre: string
  /** HH:MM, from the turno. */
  readonly hora: string
  readonly turnoTipo: 'semanal' | 'fechas'
  readonly turnoActivo: boolean
  /** Planned dates of a dated turno; [] for a weekly one. */
  readonly fechas: readonly string[]
  readonly abreMinAntes: number
  readonly cierraMinDespues: number
  readonly turnoCreado: boolean
  readonly activo: boolean
}

export interface SesionEvento {
  readonly fecha: string
  readonly ninos: number
}

export interface EventoAdmin {
  readonly id: string
  readonly campusId: string
  readonly nombre: string
  readonly tipo: TipoEvento
  /** 0 = domingo … 6 = sábado (semanal only). */
  readonly diaSemana: number | null
  readonly fechaInicio: string | null
  readonly fechaFin: string | null
  readonly precheckApp: boolean
  readonly avisosPush: boolean
  readonly visitanteUnaVez: boolean
  readonly integracionDreamTeam: boolean
  readonly anuncioMesa: string | null
  readonly activo: boolean
  readonly horarios: readonly HorarioEvento[]
  /** The last 6 session dates, newest first. */
  readonly sesiones: readonly SesionEvento[]
}

/** The options of an event, in the order of the screen. */
export const OPCIONES_EVENTO = ['precheckApp', 'avisosPush', 'visitanteUnaVez', 'integracionDreamTeam'] as const
export type OpcionEvento = (typeof OPCIONES_EVENTO)[number]

export const MAX_NOMBRE = 80
export const MAX_ANUNCIO = 140
export const MAX_VENTANA = 240
export const MAX_DIAS_DIARIO = 31

// ── reading ninos_eventos_admin ──────────────────────────────────────

type Fila = Record<string, unknown>

const esFila = (x: unknown): x is Fila => Boolean(x) && typeof x === 'object' && !Array.isArray(x)
const texto = (x: unknown): string | null => (typeof x === 'string' ? x : null)
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const fecha = (x: unknown): string | null => (typeof x === 'string' && FECHA_RE.test(x) ? x : null)
const entero = (x: unknown): number | null => (typeof x === 'number' && Number.isInteger(x) ? x : null)

function leerHorario(f: unknown): HorarioEvento | null {
  if (!esFila(f)) return null
  const id = texto(f.id)
  const turnoId = texto(f.turno_id)
  const hora = texto(f.hora)
  const abre = entero(f.abre_min_antes)
  const cierra = entero(f.cierra_min_despues)
  if (!id || !turnoId || !hora || abre === null || cierra === null) return null
  return {
    id,
    turnoId,
    nombre: texto(f.nombre) ?? '',
    hora: hora.slice(0, 5),
    turnoTipo: f.turno_tipo === 'fechas' ? 'fechas' : 'semanal',
    turnoActivo: f.turno_activo !== false,
    fechas: Array.isArray(f.fechas) ? f.fechas.map(fecha).filter((x): x is string => x !== null) : [],
    abreMinAntes: abre,
    cierraMinDespues: cierra,
    turnoCreado: f.turno_creado === true,
    activo: f.activo !== false,
  }
}

function leerSesion(f: unknown): SesionEvento | null {
  if (!esFila(f)) return null
  const dia = fecha(f.fecha)
  const ninos = entero(f.ninos)
  return dia && ninos !== null ? { fecha: dia, ninos } : null
}

function leerEvento(f: unknown): EventoAdmin | null {
  if (!esFila(f)) return null
  const id = texto(f.id)
  const campusId = texto(f.campus_id)
  const tipo = TIPOS_EVENTO.find((t) => t === f.tipo)
  if (!id || !campusId || !tipo) return null
  const lista = <T>(x: unknown, leer: (y: unknown) => T | null): T[] =>
    Array.isArray(x) ? x.map(leer).filter((y): y is T => y !== null) : []
  return {
    id,
    campusId,
    nombre: texto(f.nombre) ?? '',
    tipo,
    diaSemana: entero(f.dia_semana),
    fechaInicio: fecha(f.fecha_inicio),
    fechaFin: fecha(f.fecha_fin),
    precheckApp: f.precheck_app === true,
    avisosPush: f.avisos_push === true,
    visitanteUnaVez: f.visitante_una_vez === true,
    integracionDreamTeam: f.integracion_dream_team === true,
    anuncioMesa: texto(f.anuncio_mesa) || null,
    activo: f.activo !== false,
    horarios: lista(f.horarios, leerHorario),
    sesiones: lista(f.sesiones, leerSesion),
  }
}

/** The events of ninos_eventos_admin; rows that do not fit are dropped. */
export function leerEventosAdmin(data: unknown): EventoAdmin[] {
  return Array.isArray(data) ? data.map(leerEvento).filter((e): e is EventoAdmin => e !== null) : []
}

// ── errors ───────────────────────────────────────────────────────────

export interface ErrorRpc {
  readonly code?: string | null
  readonly message?: string | null
  readonly hint?: string | null
}

const ERROR_GENERICO = 'No se pudo guardar. Inténtalo de nuevo.'

/** For an error without HINT (an older function, a proxy): the codes the screen can explain. */
const MENSAJES: Record<string, string> = {
  sin_autoridad: 'No tienes permiso para cambiar los eventos de Niños de este campus.',
  evento_no_encontrado: 'El evento no existe en este campus.',
  horario_no_encontrado: 'El horario no existe.',
}

/** The Spanish sentence of an RPC error: its HINT as is, else a known code, else a generic one. */
export function mensajeErrorEventos(error: ErrorRpc | null | undefined): string {
  const hint = error?.hint?.trim()
  if (hint) return hint
  return MENSAJES[error?.message ?? ''] ?? ERROR_GENERICO
}

// ── checks (the same sentences as the RPC HINTs) ─────────────────────

export interface DatosEvento {
  readonly nombre: string
  readonly tipo: TipoEvento
  readonly diaSemana: number | null
  readonly fechaInicio: string | null
  readonly fechaFin: string | null
  readonly anuncioMesa: string | null
}

const esFechaReal = (x: string | null): x is string => x !== null && FECHA_RE.test(x) && !Number.isNaN(Date.parse(`${x}T00:00:00Z`))

/** Days between two YYYY-MM-DD dates. */
function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000)
}

/** Null when the event can be saved, else what to fix. */
export function validarEvento(d: DatosEvento): string | null {
  const nombre = d.nombre.trim()
  if (!nombre || nombre.length > MAX_NOMBRE) return 'El evento necesita un nombre de hasta 80 caracteres.'
  if (!TIPOS_EVENTO.includes(d.tipo)) return 'El evento es semanal, diario o de un solo día.'
  if (d.tipo === 'semanal') {
    if (d.diaSemana === null || !Number.isInteger(d.diaSemana) || d.diaSemana < 0 || d.diaSemana > 6) {
      return 'Un evento semanal necesita el día de la semana.'
    }
  } else if (d.tipo === 'diario') {
    if (!esFechaReal(d.fechaInicio) || !esFechaReal(d.fechaFin)) return 'Un evento diario necesita fecha de inicio y de fin, de 1 a 31 días.'
    const dias = diasEntre(d.fechaInicio, d.fechaFin)
    if (dias < 0 || dias > MAX_DIAS_DIARIO - 1) return 'Un evento diario necesita fecha de inicio y de fin, de 1 a 31 días.'
  } else if (!esFechaReal(d.fechaInicio)) {
    return 'Un evento de un solo día necesita su fecha.'
  }
  if ((d.anuncioMesa ?? '').trim().length > MAX_ANUNCIO) return 'El anuncio de la mesa admite hasta 140 caracteres.'
  return null
}

const esMinuto = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= MAX_VENTANA

/** Null when the check-in window can be saved. */
export function validarVentana(abreMinAntes: number, cierraMinDespues: number): string | null {
  return esMinuto(abreMinAntes) && esMinuto(cierraMinDespues) ? null : 'La apertura y el cierre van de 0 a 240 minutos.'
}

const HORA_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/

/** Null when the hour reads as 9:00 or 18:30. */
export function validarHora(hora: string): string | null {
  const v = hora.trim()
  if (!v) return 'Indica la hora del servicio.'
  return HORA_RE.test(v) ? null : 'Escribe la hora como 9:00 o 18:30.'
}

/** 9:00 → 09:00 (the RPC's time). Call after validarHora. */
export function horaParaGuardar(hora: string): string {
  const [h, m] = hora.trim().split(':')
  return `${h.padStart(2, '0')}:${m}`
}

// ── texts ────────────────────────────────────────────────────────────

export const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const
const DIAS_PLURAL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'] as const
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const

const partes = (dia: string) => {
  const d = new Date(`${dia}T00:00:00Z`)
  return { semana: d.getUTCDay(), dia: d.getUTCDate(), mes: d.getUTCMonth(), anio: d.getUTCFullYear() }
}

/** "dom 8 nov", with the year when asked: "dom 8 nov 2026". */
export function fechaCorta(dia: string, conAnio = false): string {
  const p = partes(dia)
  return `${DIAS_CORTOS[p.semana]} ${p.dia} ${MESES[p.mes]}${conAnio ? ` ${p.anio}` : ''}`
}

const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** When the event happens: "Todos los domingos", "Del mié 6 al dom 10 ene 2027", "Vie 20 nov 2026". */
export function textoFrecuencia(e: Pick<EventoAdmin, 'tipo' | 'diaSemana' | 'fechaInicio' | 'fechaFin'>): string {
  if (e.tipo === 'semanal') return e.diaSemana === null ? 'Cada semana' : `Todos los ${DIAS_PLURAL[e.diaSemana] ?? ''}`
  if (!e.fechaInicio) return ''
  if (e.tipo === 'unico' || !e.fechaFin) return mayuscula(fechaCorta(e.fechaInicio, true))
  const a = partes(e.fechaInicio)
  const b = partes(e.fechaFin)
  const p = DIAS_CORTOS[a.semana]
  const desde =
    a.anio !== b.anio ? fechaCorta(e.fechaInicio, true) : a.mes !== b.mes ? fechaCorta(e.fechaInicio) : `${p} ${a.dia}`
  return `Del ${desde} al ${fechaCorta(e.fechaFin, true)}`
}

/** "Semanal", "Diario", "Un solo día". */
export const NOMBRE_TIPO: Record<TipoEvento, string> = { semanal: 'Semanal', diario: 'Diario', unico: 'Un solo día' }

const aMinutos = (hora: string): number => {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

/** "8:15": `minutos` after (or before, negative) `hora`, within the day. */
export function moverHora(hora: string, minutos: number): string {
  const t = (((aMinutos(hora) + minutos) % 1440) + 1440) % 1440
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

/** "9:00" for "09:00". */
export const horaCorta = (hora: string): string => moverHora(hora, 0)

/** "Abre a las 8:15 · el retiro cierra a las 10:45". */
export function textoVentana(h: Pick<HorarioEvento, 'hora' | 'abreMinAntes' | 'cierraMinDespues'>): string {
  return `Abre a las ${moverHora(h.hora, -h.abreMinAntes)} · el retiro cierra a las ${moverHora(h.hora, h.cierraMinDespues)}`
}

export interface EstadoEvento {
  readonly etiqueta: string
  /** A PuntoEstado tone. */
  readonly tono: 'success' | 'info' | 'muted'
}

/** Archivado, Activo (weekly), Programado, Hoy / En curso, Terminado. */
export function estadoEvento(e: EventoAdmin, hoy: string): EstadoEvento {
  if (!e.activo) return { etiqueta: 'Archivado', tono: 'muted' }
  if (e.tipo === 'semanal' || !e.fechaInicio) return { etiqueta: 'Activo', tono: 'success' }
  const fin = e.fechaFin ?? e.fechaInicio
  if (fin < hoy) return { etiqueta: 'Terminado', tono: 'muted' }
  if (e.fechaInicio > hoy) return { etiqueta: 'Programado', tono: 'info' }
  return { etiqueta: e.tipo === 'unico' ? 'Hoy' : 'En curso', tono: 'success' }
}

/** The next date (from `hoy`, YYYY-MM-DD in Caracas) the event happens; null when archived or over. */
export function proximaFecha(e: EventoAdmin, hoy: string): string | null {
  if (!e.activo) return null
  if (e.tipo === 'semanal') {
    if (e.diaSemana === null) return null
    const d = new Date(`${hoy}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + ((e.diaSemana - d.getUTCDay() + 7) % 7))
    return d.toISOString().slice(0, 10)
  }
  if (!e.fechaInicio) return null
  const fin = e.fechaFin ?? e.fechaInicio
  if (fin < hoy) return null
  return e.fechaInicio > hoy ? e.fechaInicio : hoy
}

export interface Apertura {
  readonly fecha: string
  /** "8:15" */
  readonly hora: string
  /** "el dom 8 nov a las 8:15" */
  readonly texto: string
}

/**
 * The next check-in opening among the active events with a horario: the
 * nearest date, then the earliest opening that day. By date only: an opening
 * already past today still counts.
 */
export function proximaApertura(eventos: readonly EventoAdmin[], hoy: string): Apertura | null {
  let mejor: { fecha: string; minutos: number } | null = null
  for (const e of eventos) {
    const dia = proximaFecha(e, hoy)
    if (!dia) continue
    for (const h of e.horarios) {
      if (!h.activo) continue
      const minutos = aMinutos(h.hora) - h.abreMinAntes
      if (!mejor || dia < mejor.fecha || (dia === mejor.fecha && minutos < mejor.minutos)) mejor = { fecha: dia, minutos }
    }
  }
  if (!mejor) return null
  const hora = moverHora('00:00', mejor.minutos)
  return { fecha: mejor.fecha, hora, texto: `el ${fechaCorta(mejor.fecha)} a las ${hora}` }
}

export interface TurnoSemanal {
  readonly id: string
  readonly nombre: string
  readonly hora: string
  readonly dia_semana: number
}

/** The campus's weekly turnos on `diaSemana` that no horario links yet (a turno belongs to one horario). */
export function turnosDisponibles(
  turnos: readonly TurnoSemanal[],
  eventos: readonly EventoAdmin[],
  diaSemana: number | null,
): { id: string; nombre: string; hora: string }[] {
  const usados = new Set(eventos.flatMap((e) => e.horarios.map((h) => h.turnoId)))
  return turnos
    .filter((t) => t.dia_semana === diaSemana && !usados.has(t.id))
    .map((t) => ({ id: t.id, nombre: t.nombre, hora: t.hora.slice(0, 5) }))
}

/** What ninos_horario_quitar did, in plain Spanish. */
export function textoHorarioQuitado(nombre: string, turnoBorrado: boolean): string {
  return turnoBorrado
    ? `Quitaste el horario ${nombre}. Su turno de Dream Team no tenía voluntarios ni asistencias, así que también se borró.`
    : `Quitaste el horario ${nombre}. El turno sigue en Dream Team con sus voluntarios y asistencias.`
}

// ── RPC calls (untyped: not in database.types.ts yet) ─────────────────

export type Resultado<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly message: string }

type Cliente = Pick<SupabaseClient, 'rpc'>

async function llamar(cliente: Cliente, nombre: string, args: Record<string, unknown>): Promise<Resultado<unknown>> {
  const { data, error } = await (cliente as SupabaseClient).rpc(nombre, args)
  return error ? { ok: false, message: mensajeErrorEventos(error) } : { ok: true, data }
}

/** ninos_eventos_admin(campus): the events, or the HINT when the caller may not read them. */
export async function cargarEventosAdmin(cliente: Cliente, campusId: string): Promise<Resultado<EventoAdmin[]>> {
  const r = await llamar(cliente, 'ninos_eventos_admin', { p_campus_id: campusId })
  return r.ok ? { ok: true, data: leerEventosAdmin(r.data) } : r
}

/** A yes/no helper RPC (ninos_puede_configurar_campus…); false on any error. */
export async function consultarPermiso(cliente: Cliente, nombre: string, campusId: string): Promise<boolean> {
  const r = await llamar(cliente, nombre, { p_campus_id: campusId })
  return r.ok && r.data === true
}

export interface GuardarEventoArgs extends DatosEvento {
  readonly campusId: string
  readonly eventoId: string | null
  readonly precheckApp: boolean
  readonly avisosPush: boolean
  readonly visitanteUnaVez: boolean
  readonly integracionDreamTeam: boolean
}

/** ninos_evento_guardar: creates (eventoId null) or updates; returns the id. */
export async function rpcGuardarEvento(cliente: Cliente, a: GuardarEventoArgs): Promise<Resultado<string>> {
  const r = await llamar(cliente, 'ninos_evento_guardar', {
    p_campus_id: a.campusId,
    p_evento_id: a.eventoId,
    p_nombre: a.nombre.trim(),
    p_tipo: a.tipo,
    p_dia_semana: a.tipo === 'semanal' ? a.diaSemana : null,
    p_fecha_inicio: a.tipo === 'semanal' ? null : a.fechaInicio,
    p_fecha_fin: a.tipo === 'diario' ? a.fechaFin : null,
    p_precheck_app: a.precheckApp,
    p_avisos_push: a.avisosPush,
    p_visitante_una_vez: a.visitanteUnaVez,
    p_integracion_dream_team: a.integracionDreamTeam,
    // An empty notice clears it (NULL would keep the current one).
    p_anuncio_mesa: (a.anuncioMesa ?? '').trim(),
  })
  return r.ok ? { ok: true, data: String(r.data) } : r
}

/** ninos_evento_archivar: archive (false) or restore (true). */
export async function rpcArchivarEvento(cliente: Cliente, eventoId: string, activo: boolean): Promise<Resultado<boolean>> {
  const r = await llamar(cliente, 'ninos_evento_archivar', { p_evento_id: eventoId, p_activo: activo })
  return r.ok ? { ok: true, data: r.data === true } : r
}

export interface AgregarHorarioArgs {
  readonly eventoId: string
  /** An existing weekly turno, or… */
  readonly turnoId?: string | null
  /** …the name and hour of a new one. */
  readonly nombre?: string | null
  readonly hora?: string | null
  readonly abreMinAntes: number
  readonly cierraMinDespues: number
}

/** ninos_horario_agregar: links or creates the turno; returns the horario id. */
export async function rpcAgregarHorario(cliente: Cliente, a: AgregarHorarioArgs): Promise<Resultado<string>> {
  const conTurno = Boolean(a.turnoId)
  const r = await llamar(cliente, 'ninos_horario_agregar', {
    p_evento_id: a.eventoId,
    p_turno_id: conTurno ? a.turnoId : null,
    p_nombre: conTurno ? null : a.nombre?.trim() || null,
    p_hora: conTurno || !a.hora ? null : horaParaGuardar(a.hora),
    p_abre_min_antes: a.abreMinAntes,
    p_cierra_min_despues: a.cierraMinDespues,
  })
  return r.ok ? { ok: true, data: String(r.data) } : r
}

/** ninos_horario_ventana_guardar. */
export async function rpcGuardarVentana(
  cliente: Cliente,
  horarioId: string,
  abreMinAntes: number,
  cierraMinDespues: number,
): Promise<Resultado<null>> {
  const r = await llamar(cliente, 'ninos_horario_ventana_guardar', {
    p_horario_id: horarioId,
    p_abre_min_antes: abreMinAntes,
    p_cierra_min_despues: cierraMinDespues,
  })
  return r.ok ? { ok: true, data: null } : r
}

/** ninos_horario_quitar: whether the dated turno Niños created was deleted too. */
export async function rpcQuitarHorario(cliente: Cliente, horarioId: string): Promise<Resultado<{ turnoBorrado: boolean }>> {
  const r = await llamar(cliente, 'ninos_horario_quitar', { p_horario_id: horarioId })
  return r.ok ? { ok: true, data: { turnoBorrado: esFila(r.data) && r.data.turno_borrado === true } } : r
}
