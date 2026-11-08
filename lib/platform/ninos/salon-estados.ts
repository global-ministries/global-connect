/**
 * Niños › Salón, Esperados / Aquí / Retirados (odd/tasks/ninos-checkin-pco.md,
 * T2b, S6, S9.4; artboard design/ninos-checkin-pco/06-salon-celular.html).
 *
 * Aquí stays in ninos_lista_salon (lib/platform/ninos/salon.ts). The RPCs of
 * supabase/migrations/20261108140000_ninos_salon_estados.sql:
 *  - ninos_salon_estado (read): Esperados = today's pending pre-checks whose
 *    salón is this one (the desk's «Llegando»), Retirados, the moves of the
 *    service, the destinations the caller may move a child to, and whether the
 *    caller may move / pick up (puede_operar) or check in from the salón
 *    (puede_llegar: whoever sees the salón, L32 — coordinators, Líderes and
 *    Anfitriones; not a volunteer who only has the salón in the planilla).
 *  - ninos_mover_salon: the child changes salón in one step; same code and
 *    visit, audited.
 *  - ninos_checkin_desde_salon: «Llegó» for an Esperado (S9.4); the code is
 *    issued like at the desk and the parent's phone reads «Ingresó».
 * They are not in the generated types yet, so this file reads their JSON by
 * hand and calls them with an untyped client (as salon-voluntarios.ts).
 * Errors: the message is a short code and the HINT a Spanish sentence, shown
 * as is.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { horaEnCaracas } from './fecha'
import type { AlertasFicha } from './salon'

export type Pestana = 'esperados' | 'aqui' | 'retirados'

/** A child expected in the salón (snake_case alert fields, as ninos_lista_salon). */
export interface FilaEsperado extends AlertasFicha {
  readonly nino_id: string
  readonly nombre: string
  readonly apellido: string
  readonly fecha_nacimiento: string | null
  readonly grado: number | null
  readonly avisadoAt: string | null
  /** Who sent the notice («Voy en camino»), «nombre apellido». */
  readonly avisadoPor: string | null
}

export interface FilaRetirado {
  readonly checkinId: string
  readonly nino_id: string
  readonly nombre: string
  readonly apellido: string
  readonly fecha_nacimiento: string | null
  readonly grado: number | null
  readonly codigo: string
  readonly salidaAt: string | null
  readonly retiradoPor: string | null
}

export interface MovimientoSalon {
  readonly ninoId: string
  readonly desdeId: string
  readonly desde: string
  readonly haciaId: string
  readonly hacia: string
  readonly movidoAt: string | null
  readonly motivo: string | null
}

export interface DestinoSalon {
  readonly id: string
  readonly nombre: string
  readonly capacidad: number | null
  readonly ocupados: number
  readonly abierto: boolean
}

export interface EstadoSalon {
  readonly salonId: string
  /** Move to another salón and pick up. */
  readonly puedeOperar: boolean
  /** «Llegó» for an Esperado (whoever sees the salón, L32). */
  readonly puedeLlegar: boolean
  readonly esperados: readonly FilaEsperado[]
  readonly retirados: readonly FilaRetirado[]
  readonly movimientos: readonly MovimientoSalon[]
  readonly destinos: readonly DestinoSalon[]
}

type Fila = Record<string, unknown>

const esFila = (x: unknown): x is Fila => Boolean(x) && typeof x === 'object' && !Array.isArray(x)
const texto = (x: unknown): string | null => (typeof x === 'string' ? x : null)
const entero = (x: unknown): number | null => (typeof x === 'number' && Number.isInteger(x) ? x : null)
const booleano = (x: unknown): boolean | null => (typeof x === 'boolean' ? x : null)
const lista = (x: unknown): unknown[] => (Array.isArray(x) ? x : [])
const nombreCompleto = (x: unknown): string | null => {
  if (!esFila(x)) return null
  const n = [texto(x.nombre), texto(x.apellido)].filter(Boolean).join(' ').trim()
  return n || null
}

function leerEsperado(f: unknown): FilaEsperado | null {
  if (!esFila(f) || !texto(f.nino_id)) return null
  return {
    nino_id: texto(f.nino_id) as string,
    nombre: texto(f.nombre) ?? '',
    apellido: texto(f.apellido) ?? '',
    fecha_nacimiento: texto(f.fecha_nacimiento),
    grado: entero(f.grado),
    avisadoAt: texto(f.avisado_at),
    avisadoPor: nombreCompleto(f.avisado_por),
    alergias: texto(f.alergias),
    necesidades_especiales: texto(f.necesidades_especiales),
    habitos: texto(f.habitos),
    puede_comer: booleano(f.puede_comer),
    cambio_panal: booleano(f.cambio_panal),
    autoriza_imagen: booleano(f.autoriza_imagen),
  }
}

function leerRetirado(f: unknown): FilaRetirado | null {
  if (!esFila(f) || !texto(f.checkin_id) || !texto(f.nino_id)) return null
  return {
    checkinId: texto(f.checkin_id) as string,
    nino_id: texto(f.nino_id) as string,
    nombre: texto(f.nombre) ?? '',
    apellido: texto(f.apellido) ?? '',
    fecha_nacimiento: texto(f.fecha_nacimiento),
    grado: entero(f.grado),
    codigo: texto(f.codigo) ?? '',
    salidaAt: texto(f.salida_at),
    retiradoPor: texto(f.retirado_por_nombre),
  }
}

function leerMovimiento(f: unknown): MovimientoSalon | null {
  if (!esFila(f) || !texto(f.nino_id) || !texto(f.desde_id) || !texto(f.hacia_id)) return null
  return {
    ninoId: texto(f.nino_id) as string,
    desdeId: texto(f.desde_id) as string,
    desde: texto(f.desde) ?? '',
    haciaId: texto(f.hacia_id) as string,
    hacia: texto(f.hacia) ?? '',
    movidoAt: texto(f.movido_at),
    motivo: texto(f.motivo),
  }
}

function leerDestino(f: unknown): DestinoSalon | null {
  if (!esFila(f) || !texto(f.id)) return null
  return {
    id: texto(f.id) as string,
    nombre: texto(f.nombre) ?? '',
    capacidad: entero(f.capacidad),
    ocupados: entero(f.ocupados) ?? 0,
    abierto: f.abierto !== false,
  }
}

const sinNulos = <T>(xs: readonly (T | null)[]): T[] => xs.filter((x): x is T => x !== null)

/** The JSON of ninos_salon_estado; null when it is not that object. */
export function leerEstadoSalon(raw: unknown): EstadoSalon | null {
  if (!esFila(raw)) return null
  const salonId = texto(raw.salon_id)
  if (!salonId) return null
  return {
    salonId,
    puedeOperar: raw.puede_operar === true,
    puedeLlegar: raw.puede_llegar === true,
    esperados: sinNulos(lista(raw.esperados).map(leerEsperado)),
    retirados: sinNulos(lista(raw.retirados).map(leerRetirado)),
    movimientos: sinNulos(lista(raw.movimientos).map(leerMovimiento)),
    destinos: sinNulos(lista(raw.destinos).map(leerDestino)),
  }
}

/** Esperados · Aquí · Retirados with their counts (Aquí from the live list). */
export function opcionesPestanas(e: EstadoSalon, aqui: number): { valor: Pestana; etiqueta: string }[] {
  return [
    { valor: 'esperados', etiqueta: `Esperados ${e.esperados.length}` },
    { valor: 'aqui', etiqueta: `Aquí ${aqui}` },
    { valor: 'retirados', etiqueta: `Retirados ${e.retirados.length}` },
  ]
}

/** «Avisó 09:04 · Carolina Ríos». */
export function textoEsperado(f: Pick<FilaEsperado, 'avisadoAt' | 'avisadoPor'>): string {
  return [`Avisó ${horaEnCaracas(f.avisadoAt)}`.trim(), f.avisadoPor].filter(Boolean).join(' · ')
}

/** «Salió 09:08 con Ana Ramírez». */
export function textoRetiradoSalon(f: Pick<FilaRetirado, 'salidaAt' | 'retiradoPor'>): string {
  const salio = `Salió ${horaEnCaracas(f.salidaAt)}`.trim()
  return f.retiradoPor ? `${salio} con ${f.retiradoPor}` : salio
}

/** Seen from salón `salonId`: «Viene de Sala A · 09:10» or «Pasó a Sala B · 09:10». */
export function textoMovimiento(m: MovimientoSalon, salonId: string): string {
  const donde = m.haciaId === salonId ? `Viene de ${m.desde}` : `Pasó a ${m.hacia}`
  return [donde, horaEnCaracas(m.movidoAt)].filter(Boolean).join(' · ')
}

/** «12/18 niños», plus «lleno» and «cerrado» when they apply (they warn, never block: S9.1). */
export function textoDestino(d: DestinoSalon): string {
  const partes = [d.capacidad === null ? `${d.ocupados} niños` : `${d.ocupados}/${d.capacidad} niños`]
  if (d.capacidad !== null && d.ocupados >= d.capacidad) partes.push('lleno')
  if (!d.abierto) partes.push('cerrado')
  return partes.join(' · ')
}

type Cliente = Pick<SupabaseClient, 'rpc'>
type ErrorRpc = { message?: string; hint?: string | null } | null | undefined

/** The RPC HINT (a Spanish sentence), else `porDefecto`. */
export function mensajeErrorEstado(error: ErrorRpc, porDefecto: string): string {
  return error?.hint?.trim() || porDefecto
}

/** Esperados, Retirados, moves and destinations of the salón; null when the RPC fails. */
export async function cargarEstadoSalon(cliente: Cliente, salonId: string, turnoId: string, fecha: string): Promise<EstadoSalon | null> {
  const { data, error } = await (cliente as SupabaseClient).rpc('ninos_salon_estado', {
    p_salon_id: salonId,
    p_turno_id: turnoId,
    p_fecha: fecha,
  })
  if (error) return null
  return leerEstadoSalon(data)
}

export type ResultadoMover =
  | { ok: true; codigo: string; salonDestino: string; ocupacion: number | null; capacidad: number | null }
  | { ok: false; message: string }

/** Moves a child inside to another salón of the campus in one step (same code). */
export async function moverDeSalon(
  cliente: Cliente,
  m: { ninoId: string; turnoId: string; fecha: string; salonDestinoId: string; motivo?: string | null },
): Promise<ResultadoMover> {
  const { data, error } = await (cliente as SupabaseClient).rpc('ninos_mover_salon', {
    p_nino_id: m.ninoId,
    p_turno_id: m.turnoId,
    p_fecha: m.fecha,
    p_salon_destino_id: m.salonDestinoId,
    p_motivo: m.motivo?.trim() || null,
  })
  if (error) return { ok: false, message: mensajeErrorEstado(error, 'No se pudo mover al niño. Inténtalo de nuevo.') }
  const r = esFila(data) ? data : {}
  return {
    ok: true,
    codigo: texto(r.codigo) ?? '',
    salonDestino: texto(r.salon_destino) ?? '',
    ocupacion: entero(r.ocupacion),
    capacidad: entero(r.capacidad),
  }
}

export type ResultadoLlegada = { ok: true; codigo: string } | { ok: false; message: string }

/** «Llegó al salón»: checks in an Esperado from the salón and answers the new code. */
export async function registrarLlegada(
  cliente: Cliente,
  l: { ninoId: string; salonId: string; turnoId: string; fecha: string },
): Promise<ResultadoLlegada> {
  const { data, error } = await (cliente as SupabaseClient).rpc('ninos_checkin_desde_salon', {
    p_nino_id: l.ninoId,
    p_salon_id: l.salonId,
    p_turno_id: l.turnoId,
    p_fecha: l.fecha,
  })
  if (error) return { ok: false, message: mensajeErrorEstado(error, 'No se pudo registrar la llegada. Inténtalo de nuevo.') }
  return { ok: true, codigo: (esFila(data) ? texto(data.codigo) : null) ?? '' }
}
