'use server'

/**
 * Server actions for resolving withdrawal requests
 * (`taller_solicitudes_retiro`) from the coordinator + dirección
 * surfaces.
 *
 * Used by:
 *   - `/talleres/coordinacion/solicitudes` (coordinator, scoped to their equipo)
 *   - `/talleres/direccion/solicitudes` (director general, global)
 *
 * Unlike the inscripciones actions (which UPDATE the row directly), these
 * delegate the ENTIRE transaction to the SECURITY DEFINER RPC
 * `talleres_resolver_solicitud_retiro`, which:
 *   - derives the reviewer + scope gate from `auth.uid()` (never a
 *     caller-supplied id),
 *   - on APROBAR executes the REAL withdrawal (participante → inscripción
 *     terminal 'retirado'; equipo → asignación desactivada), then flips
 *     the solicitud to 'aprobada',
 *   - on RECHAZAR only closes the request (estado 'rechazada'), preserving
 *     history — no delete.
 *
 * The RPC IS the security wall: `auth_has_talleres_capability_scoped`
 * confines a coordinator to the equipo dream_team that owns the
 * solicitud's target, while director.write / admin.manage pass globally
 * (scope_id NULL). So the app-layer gate here is intentionally thin —
 * empty-id guard → flag → auth → RPC — and authorization surfaces to the
 * app as SQLSTATE 42501.
 *
 * The buggy `updateSolicitudRetiro` helper (writes a non-existent
 * `reviewer_persona_id` column) is deliberately BYPASSED — the RPC owns
 * every write.
 *
 * Error-code mapping (verified against the live function definition):
 *   42501 → FORBIDDEN                  (usuario_no_encontrado / sin_permisos)
 *   P0002 → NOT_FOUND_OR_NOT_PENDIENTE (no existe o ya fue procesada)
 *   22023 → INVALID_ACCION             (accion_invalida / tipo_desconocido)
 *   22004 → MISSING_TARGET             (participante sin inscripción / equipo sin asignación)
 *   else  → RESOLVE_FAILED             (unknown — surface the sql message)
 *
 * revalidation hits BOTH resolve surfaces (coordinación + dirección) plus
 * the coordination index so its pendientes counter refreshes on the next
 * navigation.
 */

import { revalidatePath } from 'next/cache'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'

export type SolicitudRetiroAccion = 'aprobar' | 'rechazar'

export type SolicitudRetiroError =
  | 'talleres-disabled'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND_OR_NOT_PENDIENTE'
  | 'INVALID_ACCION'
  | 'MISSING_TARGET'
  | 'RESOLVE_FAILED'

export interface SolicitudRetiroActionResult {
  readonly ok: boolean
  readonly error?: SolicitudRetiroError
  readonly message?: string
}

interface RpcError {
  readonly code?: string
  readonly message?: string
}

function mapRpcError(error: RpcError): SolicitudRetiroActionResult {
  switch (error.code) {
    case '42501':
      return {
        ok: false,
        error: 'FORBIDDEN',
        message:
          'No tenés permiso para resolver esta solicitud (fuera de tus talleres asignados).',
      }
    case 'P0002':
      return {
        ok: false,
        error: 'NOT_FOUND_OR_NOT_PENDIENTE',
        message:
          'La solicitud no existe o ya fue procesada. Refrescá la página.',
      }
    case '22023':
      return {
        ok: false,
        error: 'INVALID_ACCION',
        message: 'Acción inválida.',
      }
    case '22004':
      return {
        ok: false,
        error: 'MISSING_TARGET',
        message: 'La solicitud no tiene un destino válido para resolver.',
      }
    default:
      return {
        ok: false,
        error: 'RESOLVE_FAILED',
        message: error.message ?? 'No se pudo resolver la solicitud.',
      }
  }
}

function revalidateSolicitudSurfaces(): void {
  revalidatePath('/talleres/coordinacion/solicitudes')
  revalidatePath('/talleres/direccion/solicitudes')
  revalidatePath('/talleres/coordinacion')
}

/**
 * Shared core: gate then delegate to the RPC. `p_motivo` is always sent
 * as NULL from the coordinator UI — the RPC treats it as optional (only
 * an `equipo_retiro_definitivo` approve consumes it, falling back to the
 * requester's own motivo), and the reject branch ignores it entirely.
 */
async function resolverSolicitudRetiro(
  solicitudId: string,
  accion: SolicitudRetiroAccion,
): Promise<SolicitudRetiroActionResult> {
  if (!solicitudId) {
    return { ok: false, error: 'NOT_FOUND_OR_NOT_PENDIENTE' }
  }
  if (!isTalleresEnabled()) {
    return { ok: false, error: 'talleres-disabled' }
  }

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase

  const {
    data: { user },
  } = await client.auth.getUser()
  if (!user) {
    return { ok: false, error: 'UNAUTHENTICATED' }
  }

  const { error } = await client.rpc('talleres_resolver_solicitud_retiro', {
    p_solicitud_id: solicitudId,
    p_accion: accion,
    p_motivo: null,
  })

  if (error) {
    return mapRpcError(error as RpcError)
  }

  revalidateSolicitudSurfaces()
  return {
    ok: true,
    message:
      accion === 'aprobar' ? 'Solicitud aprobada.' : 'Solicitud rechazada.',
  }
}

/**
 * Approve a pending solicitud de retiro. Executes the real withdrawal on
 * the target row and flips the solicitud to 'aprobada'.
 */
export async function aprobarSolicitudRetiroAction(
  solicitudId: string,
): Promise<SolicitudRetiroActionResult> {
  return resolverSolicitudRetiro(solicitudId, 'aprobar')
}

/**
 * Reject a pending solicitud de retiro. Closes the request
 * (estado 'rechazada') without touching the target — history preserved.
 */
export async function rechazarSolicitudRetiroAction(
  solicitudId: string,
): Promise<SolicitudRetiroActionResult> {
  return resolverSolicitudRetiro(solicitudId, 'rechazar')
}
