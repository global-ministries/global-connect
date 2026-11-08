/**
 * Niños › Custodia (odd/tasks/ninos-checkin-pco.md, T2e, S9.2): a person who
 * must NOT pick up a child, with the backing (e.g. a court order) and the
 * protocol. Coordination enters it on the child's ficha; the desk, the salón
 * and the pickup show it as an alert; the pickup refuses that person.
 *
 * RPCs of supabase/migrations/20261108170000_ninos_custodia.sql:
 *  - ninos_custodia_de(niños[]): the active restrictions, for whoever operates
 *    Niños or sees the child's salón today (alerts).
 *  - ninos_custodia_lista(niño) and ninos_custodia_guardar(...): the ficha,
 *    coordinación / dirección of Niños only.
 * They are not in the generated types yet, so this file reads their rows by
 * hand and calls them with an untyped client (as salon-estados.ts). Errors:
 * the message is a short code and the HINT a Spanish sentence, shown as is.
 * Never on the label (T3) and never for parents.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** An active restriction, as the alerts show it. */
export interface RestriccionCustodia {
  readonly ninoId: string
  readonly persona: string
  readonly relacion: string | null
  readonly respaldo: string
  /** The protocol for the door. */
  readonly notas: string | null
}

/** A restriction of the ficha (active or not), for coordination. */
export interface RestriccionFicha extends Omit<RestriccionCustodia, 'ninoId'> {
  readonly id: string
  readonly activa: boolean
  readonly actualizadaAt: string | null
}

/** Active restrictions by child id. */
export type CustodiaPorNino = Readonly<Record<string, readonly RestriccionCustodia[]>>

export const MAX_PERSONA = 200
export const MAX_RELACION = 60
export const MAX_RESPALDO = 300
export const MAX_NOTAS = 500

/** «No entregar a Carlos Pérez — orden judicial del 3/5/2026». */
export function textoNoEntregar(r: Pick<RestriccionCustodia, 'persona' | 'respaldo'>): string {
  return `No entregar a ${r.persona} — ${r.respaldo}`
}

/** When the app has no coordination phone (no tel: link). */
export const AVISA_COORDINACION = 'Avisa a coordinación'

// ── reading the rows ─────────────────────────────────────────────────

type Fila = Record<string, unknown>

const esFila = (x: unknown): x is Fila => Boolean(x) && typeof x === 'object' && !Array.isArray(x)
const texto = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x.trim() : null)

/** The rows of ninos_custodia_de; rows without child, person or backing are skipped. */
export function parseCustodiaDe(data: unknown): RestriccionCustodia[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((f): RestriccionCustodia[] => {
    if (!esFila(f)) return []
    const ninoId = texto(f.nino_id)
    const persona = texto(f.persona_nombre)
    const respaldo = texto(f.respaldo)
    if (!ninoId || !persona || !respaldo) return []
    return [{ ninoId, persona, relacion: texto(f.relacion), respaldo, notas: texto(f.notas) }]
  })
}

export function agruparPorNino(restricciones: readonly RestriccionCustodia[]): CustodiaPorNino {
  const por: Record<string, RestriccionCustodia[]> = {}
  for (const r of restricciones) (por[r.ninoId] ??= []).push(r)
  return por
}

/** The rows of ninos_custodia_lista; rows without id, person or backing are skipped. */
export function parseCustodiaFicha(data: unknown): RestriccionFicha[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((f): RestriccionFicha[] => {
    if (!esFila(f)) return []
    const id = texto(f.id)
    const persona = texto(f.persona_nombre)
    const respaldo = texto(f.respaldo)
    if (!id || !persona || !respaldo) return []
    return [{
      id,
      persona,
      relacion: texto(f.relacion),
      respaldo,
      notas: texto(f.notas),
      activa: f.activa !== false,
      actualizadaAt: texto(f.updated_at),
    }]
  })
}

/**
 * One alert per person for the children of a code or a family: «No entregar a
 * X — respaldo» and the children it covers (first names), the first protocol.
 */
export interface AvisoPersona {
  readonly persona: string
  readonly respaldo: string
  readonly notas: string | null
  readonly ninoIds: readonly string[]
}

const clave = (nombre: string) =>
  nombre.trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export function avisosPorPersona(custodia: CustodiaPorNino, ninoIds: readonly string[]): AvisoPersona[] {
  const por = new Map<string, { persona: string; respaldo: string; notas: string | null; ninoIds: string[] }>()
  for (const id of ninoIds) {
    for (const r of custodia[id] ?? []) {
      const k = clave(r.persona)
      const a = por.get(k)
      if (!a) por.set(k, { persona: r.persona, respaldo: r.respaldo, notas: r.notas, ninoIds: [id] })
      else if (!a.ninoIds.includes(id)) a.ninoIds.push(id)
    }
  }
  return [...por.values()]
}

// ── checks (the same sentences as the RPC HINTs) ─────────────────────

export interface DatosRestriccion {
  readonly persona: string
  readonly relacion: string
  readonly respaldo: string
  readonly notas: string
}

/** The first problem of the form, in the words of the RPC, or null. */
export function validarRestriccion(d: DatosRestriccion): string | null {
  const persona = d.persona.trim().replace(/\s+/g, ' ')
  if (!persona || persona.length > MAX_PERSONA) return 'Escribe el nombre de la persona que no puede retirar (hasta 200 caracteres).'
  const respaldo = d.respaldo.trim()
  if (!respaldo || respaldo.length > MAX_RESPALDO) {
    return 'Indica el respaldo de la restricción (por ejemplo, la orden judicial), hasta 300 caracteres.'
  }
  if (d.relacion.trim().length > MAX_RELACION) return 'La relación admite hasta 60 caracteres.'
  if (d.notas.trim().length > MAX_NOTAS) return 'El protocolo admite hasta 500 caracteres.'
  return null
}

const ERROR_GENERICO = 'No se pudo guardar la restricción. Intenta de nuevo.'

const MENSAJES: Readonly<Record<string, string>> = {
  sin_autoridad: 'Solo coordinación o dirección de Niños puede registrar restricciones de custodia.',
  restriccion_duplicada: 'Esta persona ya tiene una restricción activa para este niño.',
  restriccion_no_encontrada: 'La restricción no existe para este niño.',
}

export type ErrorRpc = { readonly code?: string; readonly message?: string; readonly hint?: string | null }

/** The Spanish sentence of an RPC error: its HINT as is, else a known code, else a generic one. */
export function mensajeErrorCustodia(error: ErrorRpc | null | undefined): string {
  const hint = error?.hint?.trim()
  if (hint) return hint
  return MENSAJES[error?.message ?? ''] ?? ERROR_GENERICO
}

// ── RPC calls ────────────────────────────────────────────────────────

type Cliente = Pick<SupabaseClient, 'rpc'>

export type Resultado<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly message: string }

/** ninos_custodia_de: the active restrictions of those children; {} on error or without children. */
export async function cargarCustodiaDe(cliente: Cliente, ninoIds: readonly string[]): Promise<CustodiaPorNino> {
  const ids = [...new Set(ninoIds)]
  if (ids.length === 0) return {}
  const { data, error } = await (cliente as SupabaseClient).rpc('ninos_custodia_de', { p_nino_ids: ids })
  return error ? {} : agruparPorNino(parseCustodiaDe(data))
}

/** ninos_custodia_lista: every restriction of the child, or the HINT when the caller may not see them. */
export async function cargarCustodiaFicha(cliente: Cliente, ninoId: string): Promise<Resultado<RestriccionFicha[]>> {
  const { data, error } = await (cliente as SupabaseClient).rpc('ninos_custodia_lista', { p_nino_id: ninoId })
  return error ? { ok: false, message: mensajeErrorCustodia(error) } : { ok: true, data: parseCustodiaFicha(data) }
}

export interface GuardarRestriccionArgs extends DatosRestriccion {
  /** null creates a restriction. */
  readonly id: string | null
  readonly ninoId: string
  readonly activa: boolean
}

/** ninos_custodia_guardar: creates or edits (also deactivates); returns the id. */
export async function rpcGuardarRestriccion(cliente: Cliente, a: GuardarRestriccionArgs): Promise<Resultado<string>> {
  const { data, error } = await (cliente as SupabaseClient).rpc('ninos_custodia_guardar', {
    p_id: a.id,
    p_nino_id: a.ninoId,
    p_persona_nombre: a.persona,
    p_relacion: a.relacion.trim() || null,
    p_respaldo: a.respaldo,
    p_notas: a.notas.trim() || null,
    p_activa: a.activa,
  })
  if (error) return { ok: false, message: mensajeErrorCustodia(error) }
  return typeof data === 'string' ? { ok: true, data } : { ok: false, message: ERROR_GENERICO }
}
