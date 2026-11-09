/**
 * DPS planning — service notices in the app panel (odd/tasks/dps-asistencia-pco.md,
 * T15a; S13.2-S13.4, S13.6; artboards design/dps-avisos 01-07). The database
 * keeps the last notified snapshot per plan and person and computes what is
 * pending by comparing it with the current assignments
 * (supabase/migrations/20261109210000_dps_avisos.sql):
 *   - the planner reads the pending notices (dps_avisos_pendientes: nuevas,
 *     cambios, quitados and who gets nothing), sends them all at once
 *     (dps_avisos_enviar) and reads each person's state per plan
 *     (dps_avisos_estado: sin_avisar, pendiente, confirmo, no_puede, quitado);
 *   - the person reads «Mis servicios» (dps_mis_servicios), one service with
 *     whom they serve and the order (dps_mi_servicio), answers Confirmar / No
 *     puedo (dps_responder) and keeps «Fechas que no puedo servir»
 *     (dps_*_fecha*_bloqueada*).
 * A change of hours only keeps the answer; another puesto asks again (S13.4).
 * A written name («Sin cuenta») never gets a notice. These helpers read the
 * RPC answers and check what is worth sending. Pure: safe on the client.
 */
import { MENSAJE_FECHAS_BLOQUEO, MENSAJE_MOTIVO, MENSAJE_NOTA_BLOQUEO, MENSAJE_RANGO_BLOQUEO } from './errores'
import { leerFilaOrden, type FilaOrden } from './orden'
import type { ColumnaPersona } from './programacion'

export type EstadoAviso = 'pendiente' | 'confirmo' | 'no_puede'
/** What the planner sees on each assignment (01, 03). */
export type EstadoAsignacion = 'sin_avisar' | EstadoAviso | 'quitado'
export type RespuestaAviso = 'confirmo' | 'no_puede'
/** What the next send would tell the person. */
export type AvisoPorEnviar = 'nueva' | 'cambio' | 'quitado'

/** dps_responder keeps up to 300 characters of motivo. */
export const MAX_MOTIVO = 300
export const MAX_NOTA_BLOQUEO = 200
export const MAX_DIAS_BLOQUEO = 366
/** dps_avisos_* take up to 400 plans at once ('demasiados'). */
export const MAX_PLANES_AVISOS = 400

export const RESPUESTAS: readonly RespuestaAviso[] = ['confirmo', 'no_puede']

/** A puesto of the plan or a column of the sheet (Productor, Host, Comunicador, Cantantes). */
export interface RolAviso {
  readonly origen: 'puesto' | 'columna'
  readonly puestoId: string | null
  readonly columna: ColumnaPersona | null
  readonly nombre: string
  readonly equipo: string
  /** The first level under DPS (or Global Music): groups «Quiénes sirven contigo». */
  readonly direccion: string
  /** Filled by the director sync (S8): still a normal notice. */
  readonly automatico: boolean
}

interface PersonaPlanAviso {
  readonly planId: string
  readonly fecha: string
  readonly tipo: string
  readonly titulo: string | null
  readonly serie: string | null
  readonly personaId: string
  readonly nombre: string
  readonly iniciales: string
  /** The person has a login (a ficha without one sees it once they sign in). */
  readonly tieneCuenta: boolean
}

export interface InvitacionAviso extends PersonaPlanAviso {
  readonly roles: readonly RolAviso[]
  readonly automatico: boolean
  /** Who said «No puedo» in these puestos and no longer holds them (02: «reemplaza a …»). */
  readonly reemplaza: readonly string[]
}

export interface CambioAviso extends PersonaPlanAviso {
  readonly roles: readonly RolAviso[]
  /** Another puesto or date: back to Pendiente; hours only keep the answer (S13.4). */
  readonly reinicia: boolean
  readonly estado: EstadoAviso | null
  readonly horarios: readonly string[]
  readonly llegada: string
  /** The notified value of whatever changed; null when it did not. */
  readonly rolesAntes: readonly RolAviso[] | null
  readonly fechaAntes: string | null
  readonly horariosAntes: readonly string[] | null
  readonly llegadaAntes: string | null
}

export interface QuitadoAviso extends PersonaPlanAviso {
  /** What the person had been told. */
  readonly roles: readonly RolAviso[]
}

export interface SinCuentaAviso {
  readonly planId: string
  readonly fecha: string
  readonly columna: ColumnaPersona
  readonly nombre: string
}

export interface PendientesAvisos {
  /** Notices the next send delivers. */
  readonly total: number
  readonly nuevas: readonly InvitacionAviso[]
  readonly cambios: readonly CambioAviso[]
  readonly quitados: readonly QuitadoAviso[]
  readonly noReciben: {
    /** Said «No puedo» and left the plan: no other notice. */
    readonly yaRespondieron: readonly QuitadoAviso[]
    /** Written names: tell them some other way. */
    readonly sinCuenta: readonly SinCuentaAviso[]
    readonly sinCambios: number
  }
}

export interface EnvioAvisos {
  readonly enviados: number
  readonly nuevas: number
  readonly cambios: number
  readonly quitados: number
  /** «No puedo» taken out, closed without a notice. */
  readonly cerrados: number
}

export interface PersonaEstadoAviso {
  readonly personaId: string
  readonly nombre: string
  readonly iniciales: string
  readonly tieneCuenta: boolean
  readonly estado: EstadoAsignacion
  readonly porEnviar: AvisoPorEnviar | null
  /** The puestos / columns it applies to (claveDePuesto / claveDeColumna); for quitado, the notified ones. */
  readonly claves: readonly string[]
  /** «Cambió de Monitores»: the notified roles when the puestos changed. */
  readonly rolesAntes: readonly RolAviso[] | null
  /** The answer on the notice already sent, if any. */
  readonly estadoAviso: EstadoAviso | null
  readonly motivo: string | null
  readonly respondidoAt: string | null
  readonly enviadoAt: string | null
}

export interface ResumenAvisos {
  readonly sinAvisar: number
  readonly pendiente: number
  readonly confirmo: number
  readonly noPuede: number
  readonly quitado: number
  readonly sinCuenta: number
}

export interface PlanEstadoAvisos {
  readonly planId: string
  readonly fecha: string
  readonly pasado: boolean
  /** «N avisos sin enviar». */
  readonly porEnviar: number
  readonly resumen: ResumenAvisos
  readonly personas: readonly PersonaEstadoAviso[]
}

export interface EstadoAvisos {
  readonly porEnviar: number
  readonly planes: readonly PlanEstadoAvisos[]
}

/** A service as the person was told it. */
export interface ServicioAviso {
  readonly planId: string
  readonly fecha: string
  readonly tipo: string
  readonly titulo: string | null
  readonly semana: number | null
  readonly serie: { readonly nombre: string; readonly color: string; readonly imagenPath: string | null } | null
  readonly roles: readonly RolAviso[]
  readonly horarios: readonly string[]
  readonly llegada: string
  readonly estado: EstadoAviso
  readonly motivo: string | null
  readonly respondidoAt: string | null
  /** Changed after the notice («Cambió tu servicio»); the answer clears it. */
  readonly cambio: boolean
  /** Taken out after the notice («Ya no estás programado»). */
  readonly quitado: boolean
  readonly vistoAt: string | null
  /** What the last change replaced (null when that part did not change). */
  readonly antes: {
    readonly roles: readonly RolAviso[] | null
    readonly fecha: string | null
    readonly horarios: readonly string[] | null
    readonly llegada: string | null
  }
  readonly enviadoAt: string | null
  readonly enviadoPor: string | null
}

export interface MisServicios {
  readonly servicios: readonly ServicioAviso[]
  /** Unseen «Ya no estás programado» and «Cambió tu servicio» of an answered one. */
  readonly avisos: readonly ServicioAviso[]
  readonly porResponder: number
  readonly fechasBloqueadas: number
}

/** «Quiénes sirven contigo»: only whether they confirmed, never another person's «No puedo». */
export interface CompaneroServicio {
  readonly personaId: string
  readonly nombre: string
  readonly iniciales: string
  readonly yo: boolean
  readonly roles: readonly RolAviso[]
  readonly confirmo: boolean
}

export interface MiServicio {
  readonly servicio: ServicioAviso
  readonly pasado: boolean
  readonly personas: number
  readonly confirmaron: number
  readonly companeros: readonly CompaneroServicio[]
  readonly orden: readonly FilaOrden[]
}

export interface FechaBloqueada {
  readonly id: string
  readonly desde: string
  readonly hasta: string
  readonly nota: string | null
  /** The person's services inside the range: a warning, never an answer (S13.6). */
  readonly conflictos: readonly ServicioAviso[]
}

export interface PersonaBloqueada {
  readonly personaId: string
  readonly nota: string | null
}

type Objeto = Record<string, unknown>
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FECHA_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const COLUMNAS: readonly ColumnaPersona[] = ['productor', 'host', 'comunicador', 'cantantes']
const ESTADOS_AVISO: readonly EstadoAviso[] = ['pendiente', 'confirmo', 'no_puede']
const ESTADOS_ASIGNACION: readonly EstadoAsignacion[] = ['sin_avisar', 'pendiente', 'confirmo', 'no_puede', 'quitado']
const POR_ENVIAR: readonly AvisoPorEnviar[] = ['nueva', 'cambio', 'quitado']

const objeto = (v: unknown): Objeto | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Objeto) : null)
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const texto = (v: unknown): string => (typeof v === 'string' ? v : '')
const textoONulo = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const numero = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)
const textos = (v: unknown): string[] => lista(v).filter((x): x is string => typeof x === 'string')
const de = <T extends string>(valores: readonly T[], v: unknown): T | null => (valores as readonly unknown[]).includes(v) ? (v as T) : null
const leerVarios = <T>(v: unknown, leer: (x: unknown) => T | null): T[] => lista(v).map(leer).filter((x): x is T => x !== null)

export const claveDePuesto = (puestoId: string): string => `p:${puestoId}`
export const claveDeColumna = (columna: ColumnaPersona): string => `c:${columna}`
export const esRespuestaAviso = (v: unknown): v is RespuestaAviso => de(RESPUESTAS, v) !== null

export function leerRolAviso(v: unknown): RolAviso | null {
  const r = objeto(v)
  if (!r) return null
  return {
    origen: r.origen === 'columna' ? 'columna' : 'puesto',
    puestoId: esUuid(r.puesto_id) ? r.puesto_id : null,
    columna: de(COLUMNAS, r.columna),
    nombre: texto(r.nombre),
    equipo: texto(r.equipo),
    direccion: texto(r.direccion),
    automatico: r.automatico === true,
  }
}

const leerRoles = (v: unknown): RolAviso[] => leerVarios(v, leerRolAviso)
const leerRolesONulo = (v: unknown): RolAviso[] | null => (Array.isArray(v) ? leerRoles(v) : null)

function leerPersonaPlan(f: Objeto): PersonaPlanAviso | null {
  if (!esUuid(f.plan_id) || !esUuid(f.persona_id)) return null
  return {
    planId: f.plan_id,
    fecha: texto(f.fecha),
    tipo: texto(f.tipo),
    titulo: textoONulo(f.titulo),
    serie: textoONulo(f.serie),
    personaId: f.persona_id,
    nombre: texto(f.nombre),
    iniciales: texto(f.iniciales),
    tieneCuenta: f.tiene_cuenta === true,
  }
}

function leerInvitacion(v: unknown): InvitacionAviso | null {
  const f = objeto(v)
  const base = f && leerPersonaPlan(f)
  if (!f || !base) return null
  return { ...base, roles: leerRoles(f.roles), automatico: f.automatico === true, reemplaza: textos(f.reemplaza) }
}

function leerCambio(v: unknown): CambioAviso | null {
  const f = objeto(v)
  const base = f && leerPersonaPlan(f)
  if (!f || !base) return null
  return {
    ...base,
    roles: leerRoles(f.roles),
    reinicia: f.reinicia === true,
    estado: de(ESTADOS_AVISO, f.estado),
    horarios: textos(f.horarios),
    llegada: texto(f.llegada),
    rolesAntes: leerRolesONulo(f.roles_antes),
    fechaAntes: textoONulo(f.fecha_antes),
    horariosAntes: Array.isArray(f.horarios_antes) ? textos(f.horarios_antes) : null,
    llegadaAntes: textoONulo(f.llegada_antes),
  }
}

function leerQuitado(v: unknown): QuitadoAviso | null {
  const f = objeto(v)
  const base = f && leerPersonaPlan(f)
  return f && base ? { ...base, roles: leerRoles(f.roles) } : null
}

function leerSinCuenta(v: unknown): SinCuentaAviso | null {
  const f = objeto(v)
  const columna = f && de(COLUMNAS, f.columna)
  if (!f || !esUuid(f.plan_id) || !columna) return null
  return { planId: f.plan_id, fecha: texto(f.fecha), columna, nombre: texto(f.nombre) }
}

/** Reads dps_avisos_pendientes (the review panel of 02); a bad answer reads as nothing pending. */
export function leerPendientesAvisos(data: unknown): PendientesAvisos {
  const d = objeto(data) ?? {}
  const no = objeto(d.no_reciben) ?? {}
  return {
    total: numero(d.total),
    nuevas: leerVarios(d.nuevas, leerInvitacion),
    cambios: leerVarios(d.cambios, leerCambio),
    quitados: leerVarios(d.quitados, leerQuitado),
    noReciben: {
      yaRespondieron: leerVarios(no.ya_respondieron, leerQuitado),
      sinCuenta: leerVarios(no.sin_cuenta, leerSinCuenta),
      sinCambios: numero(no.sin_cambios),
    },
  }
}

/** Reads dps_avisos_enviar. */
export function leerEnvioAvisos(data: unknown): EnvioAvisos {
  const d = objeto(data) ?? {}
  return { enviados: numero(d.enviados), nuevas: numero(d.nuevas), cambios: numero(d.cambios), quitados: numero(d.quitados), cerrados: numero(d.cerrados) }
}

function leerPersonaEstado(v: unknown): PersonaEstadoAviso | null {
  const f = objeto(v)
  if (!f || !esUuid(f.persona_id)) return null
  return {
    personaId: f.persona_id,
    nombre: texto(f.nombre),
    iniciales: texto(f.iniciales),
    tieneCuenta: f.tiene_cuenta === true,
    estado: de(ESTADOS_ASIGNACION, f.estado) ?? 'sin_avisar',
    porEnviar: de(POR_ENVIAR, f.por_enviar),
    claves: textos(f.claves),
    rolesAntes: leerRolesONulo(f.roles_antes),
    estadoAviso: de(ESTADOS_AVISO, f.estado_aviso),
    motivo: textoONulo(f.motivo),
    respondidoAt: textoONulo(f.respondido_at),
    enviadoAt: textoONulo(f.enviado_at),
  }
}

function leerPlanEstado(v: unknown): PlanEstadoAvisos | null {
  const f = objeto(v)
  if (!f || !esUuid(f.plan_id)) return null
  const r = objeto(f.resumen) ?? {}
  return {
    planId: f.plan_id,
    fecha: texto(f.fecha),
    pasado: f.pasado === true,
    porEnviar: numero(f.por_enviar),
    resumen: {
      sinAvisar: numero(r.sin_avisar),
      pendiente: numero(r.pendiente),
      confirmo: numero(r.confirmo),
      noPuede: numero(r.no_puede),
      quitado: numero(r.quitado),
      sinCuenta: numero(r.sin_cuenta),
    },
    personas: leerVarios(f.personas, leerPersonaEstado),
  }
}

/** Reads dps_avisos_estado (the plan of 01 and the sheet of 03). */
export function leerEstadoAvisos(data: unknown): EstadoAvisos {
  const d = objeto(data) ?? {}
  return { porEnviar: numero(d.por_enviar), planes: leerVarios(d.planes, leerPlanEstado) }
}

/** The state of a person in a plan, or null when they have none there. */
export function estadoDePersona(estado: EstadoAvisos, planId: string, personaId: string): PersonaEstadoAviso | null {
  return estado.planes.find((p) => p.planId === planId)?.personas.find((p) => p.personaId === personaId) ?? null
}

/** Reads one service of dps_mis_servicios, dps_mi_servicio, dps_responder or a blocked range's conflicts. */
export function leerServicioAviso(v: unknown): ServicioAviso | null {
  const f = objeto(v)
  if (!f || !esUuid(f.plan_id)) return null
  const serie = objeto(f.serie)
  const antes = objeto(f.antes) ?? {}
  return {
    planId: f.plan_id,
    fecha: texto(f.fecha),
    tipo: texto(f.tipo),
    titulo: textoONulo(f.titulo),
    semana: typeof f.semana === 'number' ? f.semana : null,
    serie: serie ? { nombre: texto(serie.nombre), color: texto(serie.color), imagenPath: textoONulo(serie.imagen_path) } : null,
    roles: leerRoles(f.roles),
    horarios: textos(f.horarios),
    llegada: texto(f.llegada),
    estado: de(ESTADOS_AVISO, f.estado) ?? 'pendiente',
    motivo: textoONulo(f.motivo),
    respondidoAt: textoONulo(f.respondido_at),
    cambio: f.cambio === true,
    quitado: f.quitado === true,
    vistoAt: textoONulo(f.visto_at),
    antes: {
      roles: leerRolesONulo(antes.roles),
      fecha: textoONulo(antes.fecha),
      horarios: Array.isArray(antes.horarios) ? textos(antes.horarios) : null,
      llegada: textoONulo(antes.llegada),
    },
    enviadoAt: textoONulo(f.enviado_at),
    enviadoPor: textoONulo(f.enviado_por),
  }
}

/** Reads dps_mis_servicios (04, 07); a bad answer reads as nothing. */
export function leerMisServicios(data: unknown): MisServicios {
  const d = objeto(data) ?? {}
  return {
    servicios: leerVarios(d.servicios, leerServicioAviso),
    avisos: leerVarios(d.avisos, leerServicioAviso),
    porResponder: numero(d.por_responder),
    fechasBloqueadas: numero(d.fechas_bloqueadas),
  }
}

function leerCompanero(v: unknown): CompaneroServicio | null {
  const f = objeto(v)
  if (!f || !esUuid(f.persona_id)) return null
  return { personaId: f.persona_id, nombre: texto(f.nombre), iniciales: texto(f.iniciales), yo: f.yo === true, roles: leerRoles(f.roles), confirmo: f.confirmo === true }
}

/** Reads dps_mi_servicio (05); null without a service. */
export function leerMiServicio(data: unknown): MiServicio | null {
  const d = objeto(data)
  const servicio = d && leerServicioAviso(d.servicio)
  if (!d || !servicio) return null
  return {
    servicio,
    pasado: d.pasado === true,
    personas: numero(d.personas),
    confirmaron: numero(d.confirmaron),
    companeros: leerVarios(d.companeros, leerCompanero),
    orden: leerVarios(d.orden, leerFilaOrden),
  }
}

/** Reads one range of dps_mis_fechas_bloqueadas / dps_fecha_bloqueada_agregar (06). */
export function leerFechaBloqueada(v: unknown): FechaBloqueada | null {
  const f = objeto(v)
  if (!f || !esUuid(f.id) || !FECHA_RE.test(texto(f.desde)) || !FECHA_RE.test(texto(f.hasta))) return null
  return { id: f.id, desde: texto(f.desde), hasta: texto(f.hasta), nota: textoONulo(f.nota), conflictos: leerVarios(f.conflictos, leerServicioAviso) }
}

export const leerFechasBloqueadas = (data: unknown): FechaBloqueada[] => leerVarios(data, leerFechaBloqueada)

/** Reads dps_personas_bloqueadas: who blocked the plan's date (S13.6: pick them with a warning). */
export function leerPersonasBloqueadas(data: unknown): PersonaBloqueada[] {
  return leerVarios(data, (v) => {
    const f = objeto(v)
    return f && esUuid(f.persona_id) ? { personaId: f.persona_id, nota: textoONulo(f.nota) } : null
  })
}

/** The motivo of «No puedo», trimmed (empty = none), up to 300. */
export function validarMotivo(entrada: string | null | undefined): { readonly ok: true; readonly motivo: string | null } | { readonly ok: false; readonly mensaje: string } {
  const motivo = typeof entrada === 'string' ? entrada.trim() : ''
  if (motivo.length > MAX_MOTIVO) return { ok: false, mensaje: MENSAJE_MOTIVO }
  return { ok: true, motivo: motivo === '' ? null : motivo }
}

/** Days since 1970 of a real 'YYYY-MM-DD', or null. */
function diaDeFecha(fecha: string): number | null {
  const m = FECHA_RE.exec(fecha)
  if (!m) return null
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const ms = Date.UTC(anio, mes - 1, dia)
  const d = new Date(ms)
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia ? ms / 86_400_000 : null
}

export type ValidacionFechaBloqueada =
  | { readonly ok: true; readonly desde: string; readonly hasta: string; readonly nota: string | null }
  | { readonly ok: false; readonly codigo: 'fecha_invalida' | 'rango_invalido' | 'nota_invalida'; readonly mensaje: string }

/**
 * The checks of dps_fecha_bloqueada_agregar that do not need today: real
 * dates, desde not after hasta, at most 366 days, nota up to 200 (trimmed,
 * empty = none). The database also refuses a range that already ended.
 */
export function validarFechaBloqueada(desde: string, hasta: string, nota: string | null | undefined): ValidacionFechaBloqueada {
  const d = typeof desde === 'string' ? diaDeFecha(desde) : null
  const h = typeof hasta === 'string' ? diaDeFecha(hasta) : null
  if (d === null || h === null) return { ok: false, codigo: 'fecha_invalida', mensaje: MENSAJE_FECHAS_BLOQUEO }
  if (d > h || h - d > MAX_DIAS_BLOQUEO) return { ok: false, codigo: 'rango_invalido', mensaje: MENSAJE_RANGO_BLOQUEO }
  const limpia = typeof nota === 'string' ? nota.trim() : ''
  if (limpia.length > MAX_NOTA_BLOQUEO) return { ok: false, codigo: 'nota_invalida', mensaje: MENSAJE_NOTA_BLOQUEO }
  return { ok: true, desde, hasta, nota: limpia === '' ? null : limpia }
}
