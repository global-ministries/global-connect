/**
 * Check-out logic (odd/tasks/ninos-checkin.md, N5): the code typed at the
 * door, the rows of ninos_buscar_codigo grouped for the screen, who picks up
 * (ninos_retiro_opciones, or "Otra persona" with a reason — decision D1 of
 * odd/tasks/ninos-cobertura.md) and messages. Pickup per child (T2a of
 * odd/tasks/ninos-checkin-pco.md): the anfitrión marks which children leave.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { horaEnCaracas } from './fecha'

export type Autorizado = { nombre: string; telefono: string | null; relacion: string | null }

export type FilaCodigo = {
  checkin_id: string
  nino_id: string
  nombre: string
  apellido: string
  salon_id: string
  salon: string
  entrada_at: string
  salida_at: string | null
  retirado_por_nombre: string | null
  autorizados: Autorizado[]
}

export const MENSAJE_CODIGO_INVALIDO = 'Escribe los 4 dígitos del código.'

export function validarCodigo(texto: string): { ok: true; codigo: string } | { ok: false; error: string } {
  const codigo = texto.trim()
  return /^\d{4}$/.test(codigo) ? { ok: true, codigo } : { ok: false, error: MENSAJE_CODIGO_INVALIDO }
}

export type Retiro = { adentro: FilaCodigo[]; retirados: FilaCodigo[]; autorizados: Autorizado[] }

/** Children still inside, children already out, and the pickup people (deduplicated). */
export function agruparRetiro(filas: readonly FilaCodigo[]): Retiro {
  const vistos = new Set<string>()
  const autorizados: Autorizado[] = []
  for (const f of filas) {
    if (f.salida_at) continue
    for (const a of Array.isArray(f.autorizados) ? f.autorizados : []) {
      const clave = `${a.nombre.trim().toLowerCase()}|${(a.telefono ?? '').replace(/\D/g, '')}`
      if (vistos.has(clave)) continue
      vistos.add(clave)
      autorizados.push(a)
    }
  }
  return {
    adentro: filas.filter((f) => !f.salida_at),
    retirados: filas.filter((f) => f.salida_at),
    autorizados,
  }
}

export function textoRetirado(f: Pick<FilaCodigo, 'salida_at' | 'retirado_por_nombre'>): string {
  return `Retirado a las ${horaEnCaracas(f.salida_at)} por ${f.retirado_por_nombre ?? '—'}`
}

/** Someone who may pick up every child still inside with the code. */
export type OpcionRetiro = { nombre: string; telefono: string | null; relacion: string | null; tipo: 'representante' | 'autorizado' }

const textoONulo = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

export function parseOpcionesRetiro(data: unknown): OpcionRetiro[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((fila): OpcionRetiro[] => {
    if (typeof fila !== 'object' || fila === null) return []
    const f = fila as Record<string, unknown>
    const nombre = textoONulo(f.nombre)
    if (!nombre) return []
    return [{
      nombre,
      telefono: textoONulo(f.telefono),
      relacion: textoONulo(f.relacion),
      tipo: f.tipo === 'representante' ? 'representante' : 'autorizado',
    }]
  })
}

export const MAX_MOTIVO_RETIRO = 300

/** The anfitrión's choice: someone from the list, or another person with a reason. */
export type SeleccionRetiro = { tipo: 'lista'; nombre: string } | { tipo: 'otra'; nombre: string; motivo: string } | null

export function validarRetiro(
  sel: SeleccionRetiro,
): { ok: true; retiradoPor: string; motivoOtra: string | null } | { ok: false; error: string } {
  if (!sel) return { ok: false, error: 'Elige quién retira al niño.' }
  const nombre = sel.nombre.trim()
  if (sel.tipo === 'lista') return nombre ? { ok: true, retiradoPor: nombre, motivoOtra: null } : { ok: false, error: 'Elige quién retira al niño.' }
  if (!nombre) return { ok: false, error: 'Escribe el nombre de quien retira.' }
  const motivo = sel.motivo.trim()
  if (!motivo) return { ok: false, error: 'Escribe por qué retira una persona que no está en la lista.' }
  if (motivo.length > MAX_MOTIVO_RETIRO) return { ok: false, error: 'El motivo es muy largo (máximo 300 caracteres).' }
  return { ok: true, retiradoPor: nombre, motivoOtra: motivo }
}

/** The custody refusal of ninos_checkout (T2e, S9.2, 20261108170000): its HINT, shown as is. */
export const MENSAJE_CUSTODIA_RESTRINGIDA =
  'Esta persona tiene una restricción de custodia: no puede retirar a este niño. Llama a coordinación.'

export function mensajeDeErrorRetiro(error: { code?: string; message?: string; hint?: string | null } | null): string {
  if (error?.message === 'custodia_restringida') return error.hint?.trim() || MENSAJE_CUSTODIA_RESTRINGIDA
  if (error?.message === 'nino_no_esta_adentro') return 'Uno de los niños marcados ya salió o no tiene este código. Revisa la lista.'
  if (error?.message === 'sin_ninos') return MENSAJE_SIN_MARCADOS
  if (error?.message === 'retiro_no_autorizado') {
    return 'Esa persona no está autorizada para retirar a todos los niños de este código. Elige «Otra persona» y escribe el motivo.'
  }
  if (error?.code === '42501') return 'No tienes permiso para retirar niños de ese salón.'
  if (error?.code === '22023') return 'Escribe quién retira al niño.'
  return 'No se pudo registrar el retiro. Intenta de nuevo.'
}

// ── pickup per child ────────────────────────────────────────────────

const MENSAJE_SIN_MARCADOS = 'Marca al menos un niño.'

/** "Sofía", "Sofía y Mateo", "Sofía, Mateo y Eva". */
export function listaNatural(items: readonly string[]): string {
  if (items.length < 2) return items.join('')
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? ''

/** The only child inside starts marked; with more, the anfitrión marks them. */
export function marcadosIniciales(adentro: readonly FilaCodigo[]): string[] {
  return adentro.length === 1 ? [adentro[0].nino_id] : []
}

/**
 * The ninoIds for ninos_checkout: null (the whole code, as before) when every
 * child inside is marked; otherwise the marked children inside.
 */
export function ninoIdsParaRetiro(marcados: readonly string[], adentro: readonly FilaCodigo[]): string[] | null {
  const elegidos = adentro.filter((f) => marcados.includes(f.nino_id)).map((f) => f.nino_id)
  return adentro.length > 0 && elegidos.length === adentro.length ? null : elegidos
}

export function validarMarcados(marcados: readonly string[]): { ok: true } | { ok: false; error: string } {
  return marcados.length > 0 ? { ok: true } : { ok: false, error: MENSAJE_SIN_MARCADOS }
}

/** Who stays inside if the marked children leave: "Mateo sigue en UpStreet 3º". */
export function textoQuedan(adentro: readonly FilaCodigo[], marcados: readonly string[]): string {
  const quedan = adentro.filter((f) => !marcados.includes(f.nino_id))
  if (quedan.length === 0) return 'Salen todos los niños de este código'
  const salones = [...new Set(quedan.map((f) => f.salon))]
  return `${listaNatural(quedan.map((f) => primerNombre(f.nombre)))} ${quedan.length === 1 ? 'sigue' : 'siguen'} en ${listaNatural(salones)}`
}

/** "Retirar a Sofía · con María", or "Retirar" until a child and a person are chosen. */
export function textoBotonRetiro(marcados: readonly Pick<FilaCodigo, 'nombre'>[], quien: string | null): string {
  if (marcados.length === 0 || !quien?.trim()) return 'Retirar'
  return `Retirar a ${listaNatural(marcados.map((f) => primerNombre(f.nombre)))} · con ${primerNombre(quien)}`
}

/** A child already out: "Salió 10:52 con María Rodríguez". */
export function textoSalida(f: Pick<FilaCodigo, 'salida_at' | 'retirado_por_nombre'>): string {
  return `Salió ${horaEnCaracas(f.salida_at)} con ${f.retirado_por_nombre ?? '—'}`
}

export type FilaRetirada = { nino_id: string; salon_id: string; salida_at: string }

/** The success state: "Retirado por María Rodríguez · 10:52" and each child with their room. */
export function resumenRetiro(
  filas: readonly FilaRetirada[],
  codigo: readonly FilaCodigo[],
  retiradoPor: string,
): { titulo: string; detalle: string } {
  const salieron = filas.flatMap((r) => codigo.filter((f) => f.nino_id === r.nino_id))
  const hora = horaEnCaracas(filas[0]?.salida_at ?? null)
  return {
    titulo: `Retirado por ${retiradoPor}${hora ? ` · ${hora}` : ''}`,
    detalle: `${listaNatural(salieron.map((f) => `${primerNombre(f.nombre)} salió de ${f.salon}`))}.`,
  }
}

export type RetiroReciente = {
  ninoId: string
  nombre: string
  salon: string
  salidaAt: string
  retiradoPor: string | null
  otraPersona: boolean
}
export type RetirosRecientes = { adentro: number; salieron: number; retiros: RetiroReciente[] }

/** The jsonb of ninos_retiros_recientes; malformed pickups are skipped. */
export function parseRetirosRecientes(data: unknown): RetirosRecientes | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  const d = data as Record<string, unknown>
  if (typeof d.adentro !== 'number' || typeof d.salieron !== 'number') return null
  const retiros = (Array.isArray(d.retiros) ? d.retiros : []).flatMap((x): RetiroReciente[] => {
    if (typeof x !== 'object' || x === null) return []
    const r = x as Record<string, unknown>
    if (typeof r.nino_id !== 'string' || typeof r.salida_at !== 'string') return []
    return [{
      ninoId: r.nino_id,
      nombre: [textoONulo(r.nombre), textoONulo(r.apellido)].filter(Boolean).join(' '),
      salon: textoONulo(r.salon) ?? '',
      salidaAt: r.salida_at,
      retiradoPor: textoONulo(r.retirado_por_nombre),
      otraPersona: r.otra_persona === true,
    }]
  })
  return { adentro: d.adentro, salieron: d.salieron, retiros }
}

// ── RPC calls (untyped: p_nino_ids and ninos_retiros_recientes are not in database.types.ts yet) ──

type Cliente = Pick<SupabaseClient, 'rpc'>

/** Who may pick up: the marked children (ninoIds), or every child inside with the code when null. [] on error. */
export async function cargarOpcionesRetiro(
  cliente: Cliente,
  a: { codigo: string; turnoId: string; fecha: string; ninoIds: readonly string[] | null },
): Promise<OpcionRetiro[]> {
  const { data, error } = await (cliente as SupabaseClient).rpc('ninos_retiro_opciones', {
    p_codigo: a.codigo,
    p_turno_id: a.turnoId,
    p_fecha: a.fecha,
    ...(a.ninoIds && a.ninoIds.length > 0 ? { p_nino_ids: a.ninoIds } : {}),
  })
  return error ? [] : parseOpcionesRetiro(data)
}

/** ninos_retiros_recientes(turno, fecha); null on error. */
export async function cargarRetirosRecientes(cliente: Cliente, turnoId: string, fecha: string): Promise<RetirosRecientes | null> {
  const { data, error } = await (cliente as SupabaseClient).rpc('ninos_retiros_recientes', { p_turno_id: turnoId, p_fecha: fecha })
  return error ? null : parseRetirosRecientes(data)
}
