/**
 * PR12 — DT-046 — Talleres metrics module.
 *
 * Role-scoped via the API route's capability gate
 * (`talleres_crecimiento.metrics.read` and friends). All 5 functions
 * are read-only — they query participation + inscriptions + attendance
 * tables and return aggregate metrics.
 *
 * `noAprobadosPorMotivo` is internal — the motivos are sensitive (D17/D18)
 * and must never leak through the public API surface.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Pure-result types (no I/O concerns) ─────────────────────────────────────

export interface FinalizationRate {
  readonly completados: number
  readonly totalConEstadoFinal: number
  readonly rate: number // 0..1; 0 when total is 0
}

export interface InscripcionesActivas {
  readonly activas: number // count(estado IN ('pendiente','aprobado'))
}

export interface AsistenciaPromedio {
  readonly promedio: number // 0..1
}

export interface NoAprobadosPorMotivoEntry {
  readonly motivo: string
  readonly count: number
}

export type NoAprobadosPorMotivo = readonly NoAprobadosPorMotivoEntry[]

// ── Helpers (pure) ────────────────────────────────────────────────────────

/**
 * Pure rate = completados / total. Returns 0 when total is 0 (avoid /0).
 * Always returns a value in [0, 1] when total > 0.
 */
export function computeRate(completados: number, totalConEstadoFinal: number): number {
  if (totalConEstadoFinal <= 0) return 0
  if (completados < 0) return 0
  if (completados > totalConEstadoFinal) return 1
  return completados / totalConEstadoFinal
}

// ── Taller-scoped queries (single Supabase roundtrip each) ────────────────

/**
 * Finalization rate for a single taller. Counts inscripciones whose
 * unit_estado reached a terminal value (completado|no_completado|abandono)
 * and divides by that total. inscripciones still in
 * unit_estado=NULL are NOT counted in the denominator.
 */
export async function finalizationRateByTaller(
  client: SupabaseClient,
  tallerId: string,
): Promise<FinalizationRate> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase server client; column projection for tallers metric
  const { data, error } = await (client as any)
    .from('taller_inscripciones')
    .select('id, unit_estado')
    .eq('taller_id', tallerId)
  if (error) throw new Error(`finalizationRateByTaller(${tallerId}): ${error.message}`)

  let completados = 0
  let totalConEstadoFinal = 0
  for (const row of (data ?? []) as Array<{ readonly unit_estado: string | null }>) {
    if (row.unit_estado === null) continue
    totalConEstadoFinal += 1
    if (row.unit_estado === 'completado') completados += 1
  }
  return {
    completados,
    totalConEstadoFinal,
    rate: computeRate(completados, totalConEstadoFinal),
  }
}

/**
 * Finalization rate across all talleres inside a single periodo general.
 * Aggregates `unit_estado` over inscripciones linked to that periodo.
 */
export async function finalizationRateByPeriodoGeneral(
  client: SupabaseClient,
  periodoId: string,
): Promise<FinalizationRate> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase server client; join cohort→inscripciones
  const { data, error } = await (client as any)
    .from('taller_inscripciones')
    .select('id, unit_estado, cohorte:talleres_crecimiento_cohortes!inner(periodo_general_id)')
    .eq('cohorte.periodo_general_id', periodoId)
  if (error) throw new Error(`finalizationRateByPeriodoGeneral(${periodoId}): ${error.message}`)

  let completados = 0
  let totalConEstadoFinal = 0
  for (const row of (data ?? []) as Array<{ readonly unit_estado: string | null }>) {
    if (row.unit_estado === null) continue
    totalConEstadoFinal += 1
    if (row.unit_estado === 'completado') completados += 1
  }
  return {
    completados,
    totalConEstadoFinal,
    rate: computeRate(completados, totalConEstadoFinal),
  }
}

/**
 * Count of inscripciones still active in the taller — pending or approved.
 */
export async function inscripcionesActivas(
  client: SupabaseClient,
  tallerId: string,
): Promise<InscripcionesActivas> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase server client
  const { count, error } = await (client as any)
    .from('taller_inscripciones')
    .select('id', { count: 'exact', head: true })
    .eq('taller_id', tallerId)
    .in('estado', ['pendiente', 'aprobado'])
  if (error) throw new Error(`inscripcionesActivas(${tallerId}): ${error.message}`)
  return { activas: Number(count ?? 0) }
}

/**
 * Attendance average across all realized sesiones for the taller. Range [0, 1].
 * For each realized sesion: present / total_asistencias. Then average across
 * sesiones. Sesiones with 0 inscripciones are excluded from the average.
 */
export async function asistenciaPromedio(
  client: SupabaseClient,
  tallerId: string,
): Promise<AsistenciaPromedio> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase server client
  const { data, error } = await (client as any)
    .from('taller_asistencias')
    .select('estado, sesion_id, sesion:taller_sesiones!inner(grupo_id, grupo:taller_grupos!inner(taller_id))')
    .eq('sesion.grupo.taller_id', tallerId)
  if (error) throw new Error(`asistenciaPromedio(${tallerId}): ${error.message}`)

  const totalsBySession = new Map<string, { presentes: number; total: number }>()
  for (const row of (data ?? []) as Array<{ estado: string; sesion_id: string }>) {
    const bucket = totalsBySession.get(row.sesion_id) ?? { presentes: 0, total: 0 }
    bucket.total += 1
    if (row.estado === 'presente') bucket.presentes += 1
    totalsBySession.set(row.sesion_id, bucket)
  }

  let total = 0
  let sesiones = 0
  for (const v of totalsBySession.values()) {
    if (v.total === 0) continue
    total += v.presentes / v.total
    sesiones += 1
  }
  const promedio = sesiones === 0 ? 0 : total / sesiones
  return { promedio }
}

/**
 * Internal-only. Group no-aprobado inscripciones by motivo_no_aprobado.
 * Never expose this through the public API surface — motivos contain
 * sensitive context (sensitive review notes).
 */
export async function noAprobadosPorMotivo(
  client: SupabaseClient,
  tallerId: string,
): Promise<NoAprobadosPorMotivo> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase server client
  const { data, error } = await (client as any)
    .from('taller_inscripciones')
    .select('motivo_no_aprobado')
    .eq('taller_id', tallerId)
    .eq('estado', 'no_aprobado')
  if (error) throw new Error(`noAprobadosPorMotivo(${tallerId}): ${error.message}`)

  const counts = new Map<string, number>()
  for (const row of (data ?? []) as Array<{ readonly motivo_no_aprobado: string | null }>) {
    const key = (row.motivo_no_aprobado ?? '').trim() || '(vacío)'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const out: NoAprobadosPorMotivoEntry[] = []
  for (const [motivo, count] of counts.entries()) {
    out.push({ motivo, count })
  }
  // Sort by count desc for stable output.
  out.sort((a, b) => b.count - a.count)
  return out
}
