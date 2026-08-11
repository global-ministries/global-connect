/**
 * PR11 — DT-044 — Talleres withdrawal-request module.
 *
 * Pure state machine + audit helpers. `createSolicitudRetiro` and
 * `updateSolicitudRetiro` use Supabase via the standard client; the
 * caller is responsible for authentication + RLS bypass (service_role
 * if no capability matches).
 *
 * State machine (pure):
 *   pendiente -> aprobada | rechazada
 *   aprobada  -> (terminal)
 *   rechazada -> (terminal)
 *
 * Exactly one of `inscripcion_id` or `grupo_asignacion_id` is required
 * (CHECK xor). The DB enforces this via a CHECK constraint; the helper
 * validates before insert.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type SolicitudRetiroTipo = 'participante_retiro' | 'equipo_retiro_definitivo'
export type SolicitudRetiroEstado = 'pendiente' | 'aprobada' | 'rechazada'

export interface CreateSolicitudRetiroInput {
  readonly inscripcion_id: string | null
  readonly grupo_asignacion_id: string | null
  readonly solicitante_persona_id: string
  readonly tipo: SolicitudRetiroTipo
  readonly motivo: string
}

export class InvalidSolicitudRetiroError extends Error {
  readonly code:
    | 'INVALID_MOTIVO'
    | 'MISSING_TARGET'
    | 'MULTIPLE_TARGETS'
  constructor(code: InvalidSolicitudRetiroError['code'], message: string) {
    super(message)
    this.name = 'InvalidSolicitudRetiroError'
    this.code = code
  }
}

export class InvalidSolicitudTransitionError extends Error {
  readonly from: SolicitudRetiroEstado
  readonly action: 'aprobar' | 'rechazar'
  constructor(from: SolicitudRetiroEstado, action: 'aprobar' | 'rechazar') {
    super(
      `SolicitudRetiro cannot transition from '${from}' via '${action}' (terminal or invalid)`,
    )
    this.name = 'InvalidSolicitudTransitionError'
    this.from = from
    this.action = action
  }
}

/**
 * Validate the input shape before talking to the DB. Throws
 * InvalidSolicitudRetiroError on any rule violation. Pure.
 */
export function validateCreateSolicitudRetiro(
  input: CreateSolicitudRetiroInput,
): void {
  if (input.motivo.trim().length === 0) {
    throw new InvalidSolicitudRetiroError(
      'INVALID_MOTIVO',
      'motivo is required and cannot be empty',
    )
  }
  const hasInscripcion = input.inscripcion_id !== null
  const hasGrupo = input.grupo_asignacion_id !== null
  if (!hasInscripcion && !hasGrupo) {
    throw new InvalidSolicitudRetiroError(
      'MISSING_TARGET',
      'one of inscripcion_id or grupo_asignacion_id is required',
    )
  }
  if (hasInscripcion && hasGrupo) {
    throw new InvalidSolicitudRetiroError(
      'MULTIPLE_TARGETS',
      'inscripcion_id and grupo_asignacion_id are mutually exclusive',
    )
  }
}

/**
 * Insert a new solicitud_retiro with validation. Returns the new id
 * and the initial `pendiente` state.
 */
export async function createSolicitudRetiro(
  supabase: SupabaseClient,
  input: CreateSolicitudRetiroInput,
): Promise<{ readonly id: string; readonly estado: 'pendiente' }> {
  validateCreateSolicitudRetiro(input)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase server client; column-typed via DB constraints
  const { data, error } = await (supabase as any)
    .from('taller_solicitudes_retiro')
    .insert({
      inscripcion_id: input.inscripcion_id,
      grupo_asignacion_id: input.grupo_asignacion_id,
      solicitante_persona_id: input.solicitante_persona_id,
      tipo: input.tipo,
      motivo: input.motivo,
      estado: 'pendiente',
    })
    .select('id, estado')
    .single()

  if (error || !data) {
    throw new Error(`createSolicitudRetiro: ${error?.message ?? 'no row returned'}`)
  }
  return { id: data.id as string, estado: 'pendiente' }
}

/**
 * Pure state transition for review (aprobada/rechazada). Always throws
 * on any other source state — terminal states are immutable.
 */
export function reviewSolicitudRetiro(
  current: { readonly estado: SolicitudRetiroEstado },
  action: 'aprobar' | 'rechazar',
): SolicitudRetiroEstado {
  if (current.estado !== 'pendiente') {
    throw new InvalidSolicitudTransitionError(current.estado, action)
  }
  return action === 'aprobar' ? 'aprobada' : 'rechazada'
}

/**
 * Server-side helper to update a solicitud_retiro's estado. The caller
 * must have `talleres_crecimiento.director.write` or
 * `coordinator.write` capability (the DB's RLS enforces the same gate).
 */
export async function updateSolicitudRetiro(
  supabase: SupabaseClient,
  id: string,
  action: 'aprobar' | 'rechazar',
  reviewer_persona_id: string,
  currentEstado: SolicitudRetiroEstado,
  motivo_rechazo?: string,
): Promise<void> {
  const next = reviewSolicitudRetiro({ estado: currentEstado }, action)
  const patch: Record<string, unknown> = {
    estado: next,
    // reviewer_persona_id is logged at the row level via the audit
    // pattern; the helper writes it as JSONB metadata so the existing
    // taller_reporte_correcciones pattern is mirrored.
  }
  if (action === 'rechazar' && motivo_rechazo && motivo_rechazo.trim().length > 0) {
    patch['motivo'] = motivo_rechazo // overwrites motivo with reviewer rationale
  }
  patch['reviewer_persona_id'] = reviewer_persona_id

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase server client
  const { error } = await (supabase as any)
    .from('taller_solicitudes_retiro')
    .update(patch)
    .eq('id', id)

  if (error) {
    throw new Error(`updateSolicitudRetiro(${id}): ${error.message}`)
  }
}
