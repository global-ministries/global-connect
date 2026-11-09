/**
 * Niños › Salón, voluntarios de hoy (odd/tasks/ninos-checkin-pco.md, T2c, S7,
 * S5, L27): who serves the salón today, who arrived and whether there are
 * enough volunteers for the children inside; and, for the volunteers sheet,
 * the salón of each volunteer.
 *
 * Who serves a salón (L27): each volunteer has a habitual salón chosen in
 * /ninos/voluntarios, changeable for one service («solo hoy»); without a
 * salón they are «Anfitriones / mesa».
 *
 * The RPCs (supabase/migrations/20261108130000_ninos_salon_voluntarios.sql):
 * ninos_salon_voluntarios (salón screen, read-only: attendance is marked only
 * in /ninos/voluntarios, S7), ninos_voluntarios_salones (sheet, read) and
 * ninos_voluntario_salon_asignar (sheet, write). They are not in the
 * generated types yet, so this file reads their JSON by hand and calls them
 * with an untyped client (as lib/platform/ninos/eventos.ts). Errors: the
 * message is a short code and the HINT a Spanish sentence, shown as is.
 *
 * Rule of the salón (S5): ninos_por_voluntario (NULL = no limit) and
 * min_voluntarios (0 = none). Needed = max(min, ceil(children / per
 * volunteer)); only the volunteers who arrived (Llegó) count.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { horaEnCaracas } from './fecha'

export type EstadoVoluntario = 'presente' | 'justificado' | 'ausente'

export interface VoluntarioSalon {
  readonly servicioId: string
  readonly nombre: string
  readonly apellido: string
  readonly rol: string | null
  /** false = came without being called for this turno. */
  readonly esperado: boolean
  /** The mark of the volunteers sheet; null = nobody marked them yet. */
  readonly estado: EstadoVoluntario | null
  readonly marcadoAt: string | null
}

export interface ReglaVoluntarios {
  readonly ninosPorVoluntario: number | null
  readonly minVoluntarios: number
}

export interface SalonVoluntarios extends ReglaVoluntarios {
  readonly salonId: string
  readonly capacidad: number | null
  /** Volunteers of this turno whose salón today is this one (expected or not). */
  readonly asignados: number
  readonly voluntarios: readonly VoluntarioSalon[]
}

export interface ResumenVoluntarios {
  readonly llegaron: number
  /** null = the salón has no rule. */
  readonly necesarios: number | null
  readonly faltan: number
  /** null = no rule, so no verdict. */
  readonly suficientes: boolean | null
}

type Fila = Record<string, unknown>

const esFila = (x: unknown): x is Fila => Boolean(x) && typeof x === 'object' && !Array.isArray(x)
const texto = (x: unknown): string | null => (typeof x === 'string' ? x : null)
const entero = (x: unknown): number | null => (typeof x === 'number' && Number.isInteger(x) ? x : null)
const ESTADOS: readonly EstadoVoluntario[] = ['presente', 'justificado', 'ausente']

function leerVoluntario(f: unknown): VoluntarioSalon | null {
  if (!esFila(f)) return null
  const servicioId = texto(f.servicio_id)
  if (!servicioId) return null
  const estado = ESTADOS.find((e) => e === f.estado) ?? null
  return {
    servicioId,
    nombre: texto(f.nombre) ?? '',
    apellido: texto(f.apellido) ?? '',
    rol: texto(f.rol),
    esperado: f.esperado === true,
    estado,
    marcadoAt: texto(f.marcado_at),
  }
}

/** The JSON of ninos_salon_voluntarios; null when it is not that object. */
export function leerSalonVoluntarios(raw: unknown): SalonVoluntarios | null {
  if (!esFila(raw)) return null
  const salonId = texto(raw.salon_id)
  if (!salonId) return null
  const lista = Array.isArray(raw.voluntarios) ? raw.voluntarios : []
  return {
    salonId,
    capacidad: entero(raw.capacidad),
    ninosPorVoluntario: entero(raw.ninos_por_voluntario),
    minVoluntarios: entero(raw.min_voluntarios) ?? 0,
    asignados: entero(raw.asignados) ?? 0,
    voluntarios: lista.map(leerVoluntario).filter((v): v is VoluntarioSalon => v !== null),
  }
}

/** Volunteers the salón needs for `ninos` children; null when it has no rule. */
export function voluntariosNecesarios(regla: ReglaVoluntarios, ninos: number): number | null {
  const porVoluntario = regla.ninosPorVoluntario && regla.ninosPorVoluntario > 0 ? regla.ninosPorVoluntario : null
  const minimo = Math.max(0, regla.minVoluntarios)
  if (porVoluntario === null && minimo === 0) return null
  return Math.max(minimo, porVoluntario === null ? 0 : Math.ceil(Math.max(0, ninos) / porVoluntario))
}

/** Who arrived, how many are needed and how many are missing. */
export function resumenVoluntarios(d: SalonVoluntarios, ninos: number): ResumenVoluntarios {
  const llegaron = d.voluntarios.filter((v) => v.estado === 'presente').length
  const necesarios = voluntariosNecesarios(d, ninos)
  if (necesarios === null) return { llegaron, necesarios, faltan: 0, suficientes: null }
  const faltan = Math.max(0, necesarios - llegaron)
  return { llegaron, necesarios, faltan, suficientes: faltan === 0 }
}

/** «Llegó 08:35», «Avisó», «Faltó» or «Pendiente». */
export function textoEstadoVoluntario(v: VoluntarioSalon): string {
  if (v.estado === 'presente') return `Llegó ${horaEnCaracas(v.marcadoAt)}`.trim()
  if (v.estado === 'justificado') return 'Avisó'
  if (v.estado === 'ausente') return 'Faltó'
  return 'Pendiente'
}

/** «falta 1» / «faltan 3». */
export function textoFaltan(n: number): string {
  return n === 1 ? 'falta 1' : `faltan ${n}`
}

/** «máximo 6 niños por voluntario, mínimo 2 voluntarios»; empty without a rule. */
export function textoRegla(regla: ReglaVoluntarios): string {
  const partes: string[] = []
  if (regla.ninosPorVoluntario) {
    partes.push(`máximo ${regla.ninosPorVoluntario} ${regla.ninosPorVoluntario === 1 ? 'niño' : 'niños'} por voluntario`)
  }
  if (regla.minVoluntarios > 0) {
    partes.push(`mínimo ${regla.minVoluntarios} ${regla.minVoluntarios === 1 ? 'voluntario' : 'voluntarios'}`)
  }
  return partes.join(', ')
}

type Cliente = Pick<SupabaseClient, 'rpc'>

/** Today's volunteers of the salón; null when the RPC fails or answers something else. */
export async function cargarSalonVoluntarios(
  cliente: Cliente,
  salonId: string,
  turnoId: string,
  fecha: string,
): Promise<SalonVoluntarios | null> {
  const { data, error } = await (cliente as SupabaseClient).rpc('ninos_salon_voluntarios', {
    p_salon_id: salonId,
    p_turno_id: turnoId,
    p_fecha: fecha,
  })
  if (error) return null
  return leerSalonVoluntarios(data)
}

// ── volunteers sheet: the salón of each volunteer ────────────────────

/** Value of the «Anfitriones / mesa» option (no salón). */
export const MESA = ''

export interface SalonOpcionPlanilla {
  readonly id: string
  readonly nombre: string
}

export interface AsignacionSalon {
  /** The salón of this service; null = Anfitriones / mesa. */
  readonly salonId: string | null
  readonly habitualId: string | null
  /** true = set only for this service («solo hoy»). */
  readonly esDelDia: boolean
}

export interface SalonesPlanilla {
  readonly salones: readonly SalonOpcionPlanilla[]
  /** Volunteers without an entry have no salón (mesa) and no day value. */
  readonly porServicio: ReadonlyMap<string, AsignacionSalon>
}

/** The JSON of ninos_voluntarios_salones; null when it is not that object. */
export function leerSalonesPlanilla(raw: unknown): SalonesPlanilla | null {
  if (!esFila(raw) || !Array.isArray(raw.salones) || !Array.isArray(raw.asignaciones)) return null
  const salones = raw.salones.flatMap((s) => {
    const id = esFila(s) ? texto(s.id) : null
    return id && esFila(s) ? [{ id, nombre: texto(s.nombre) ?? '' }] : []
  })
  const porServicio = new Map<string, AsignacionSalon>()
  for (const a of raw.asignaciones) {
    const servicioId = esFila(a) ? texto(a.servicio_id) : null
    if (!servicioId || !esFila(a)) continue
    porServicio.set(servicioId, { salonId: texto(a.salon_id), habitualId: texto(a.habitual_id), esDelDia: a.es_del_dia === true })
  }
  return { salones, porServicio }
}

export async function cargarSalonesPlanilla(cliente: Cliente, turnoId: string, fecha: string): Promise<SalonesPlanilla | null> {
  const { data, error } = await (cliente as SupabaseClient).rpc('ninos_voluntarios_salones', { p_turno_id: turnoId, p_fecha: fecha })
  if (error) return null
  return leerSalonesPlanilla(data)
}

type ErrorRpc = { message?: string; hint?: string | null } | null | undefined

/** The RPC HINT (a Spanish sentence), else a plain one. */
export function mensajeErrorSalon(error: ErrorRpc): string {
  return error?.hint?.trim() || 'No se pudo guardar el salón. Inténtalo de nuevo.'
}

/**
 * Sets the habitual salón (no turno/fecha; null = mesa) or the salón of one
 * service (turno and fecha; a value equal to the habitual undoes «solo hoy»).
 */
export async function asignarSalonVoluntario(
  cliente: Cliente,
  a: { servicioId: string; salonId: string | null; turnoId?: string; fecha?: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await (cliente as SupabaseClient).rpc('ninos_voluntario_salon_asignar', {
    p_servicio_id: a.servicioId,
    p_salon_id: a.salonId,
    p_turno_id: a.turnoId ?? null,
    p_fecha: a.fecha ?? null,
  })
  return error ? { ok: false, message: mensajeErrorSalon(error) } : { ok: true }
}
