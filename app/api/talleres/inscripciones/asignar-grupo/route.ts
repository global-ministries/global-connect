/**
 * T2 (odd/tasks/talleres-inscripcion-a-grupo.md) — POST
 * /api/talleres/inscripciones/asignar-grupo
 *
 * Thin wrapper around the SECURITY DEFINER RPC
 * `talleres_asignar_inscripciones_a_grupo(p_inscripcion_ids, p_grupo_id)`
 * (T1, migration 20260924130000). `grupo_id: null` unassigns.
 *
 * The RPC IS the security wall — same philosophy as
 * `solicitudes-retiro-actions.ts`'s `resolverSolicitudRetiro`: it derives
 * the acting persona from `auth.uid()`, then gates on the TARGET grupo's
 * org node (assign) or each inscripción's own current node (unassign),
 * via `auth_has_talleres_capability_scoped`. The app-layer gate here is
 * intentionally thin — flag check + authenticated session — never a flat
 * capability check, which would wrongly deny a coordinador who is scoped
 * to their own branch but holds no GLOBAL capability.
 *
 * The RPC is NOT in production yet (T1's evidence). This route must fail
 * soft on ANY error — including "function does not exist" — mapping it
 * to a readable Spanish message, never crashing the page.
 *
 * Error-code mapping (verified against the live function + trigger,
 * supabase/migrations/20260924{120000,130000}_*.sql):
 *   42501 → FORBIDDEN            (usuario_no_encontrado / sin_permisos_para_este_grupo)
 *   P0001 GRUPO_DE_OTRA_COHORTE  → INVALID_GRUPO
 *   P0001 INSCRIPCION_NO_APROBADA → NOT_APROBADA
 *   P0002 → NOT_FOUND            (inscripcion_no_encontrada)
 *   22023 → MISSING_IDS          (sin_inscripciones)
 *   else (including 42883 "function does not exist") → FAILED
 *
 * Revalidates the edición route always, and the grupo route too when
 * `grupo_id` is present (assign) — mirrors ae4bfb7's fix for the edición
 * open/close actions: resolve the taller's slug from the already-known
 * ids (a couple of extra reads) so BOTH the new /talleres/[taller]/
 * [edicion] route and (when applicable) /talleres/[taller]/[edicion]/
 * [grupo] refresh, not just one of them.
 */

import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

import { requireTalleresApiAuthenticated } from '@/lib/platform/talleres/api-helpers'

interface Body {
  readonly inscripcion_ids: readonly string[]
  readonly grupo_id: string | null
}

interface RpcError {
  readonly code?: string
  readonly message?: string
}

function mapRpcError(error: RpcError): { error: string; message: string } {
  switch (error.code) {
    case '42501':
      return {
        error: 'FORBIDDEN',
        message: 'No tenés permiso para asignar inscripciones a este grupo.',
      }
    case 'P0001':
      if (error.message === 'GRUPO_DE_OTRA_COHORTE') {
        return {
          error: 'INVALID_GRUPO',
          message: 'Ese grupo pertenece a otra cohorte de esta edición.',
        }
      }
      if (error.message === 'INSCRIPCION_NO_APROBADA') {
        return {
          error: 'NOT_APROBADA',
          message: 'Solo se pueden ubicar inscripciones aprobadas.',
        }
      }
      return { error: 'FAILED', message: 'No se pudo asignar el grupo.' }
    case 'P0002':
      return {
        error: 'NOT_FOUND',
        message: 'Una o más inscripciones no existen. Refrescá la página.',
      }
    case '22023':
      return { error: 'MISSING_IDS', message: 'Seleccioná al menos una inscripción.' }
    default:
      // Fail soft: the RPC may not exist yet in this environment (T1's
      // evidence — not in production). Never crash the page.
      return { error: 'FAILED', message: 'No se pudo asignar el grupo. Intentá de nuevo.' }
  }
}

/**
 * Resolves and revalidates every screen that shows this grupo's
 * ocupación / roster: the edición route always, the grupo route too
 * when `grupoId` is known.
 */
async function revalidarPantallasDeGrupo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  client: any,
  grupoId: string,
): Promise<void> {
  const { data: grupo } = await client
    .from('taller_grupos')
    .select('cohorte_id')
    .eq('id', grupoId)
    .maybeSingle()
  if (!grupo?.cohorte_id) return

  const { data: cohorte } = await client
    .from('talleres_crecimiento_cohortes')
    .select('taller_id')
    .eq('id', grupo.cohorte_id)
    .maybeSingle()
  const edicionId = cohorte?.taller_id
  if (!edicionId) return

  const { data: edicion } = await client
    .from('taller_ediciones')
    .select('taller_id')
    .eq('id', edicionId)
    .maybeSingle()
  const tallerAbstractoId = edicion?.taller_id
  if (!tallerAbstractoId) return

  const { data: taller } = await client
    .from('talleres')
    .select('slug')
    .eq('id', tallerAbstractoId)
    .maybeSingle()
  if (!taller?.slug) return

  revalidatePath(`/talleres/${taller.slug}/${edicionId}`)
  revalidatePath(`/talleres/${taller.slug}/${edicionId}/${grupoId}`)
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireTalleresApiAuthenticated()
  if (!gate.ok) return gate.response

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid-body' }, { status: 400 })
  }
  if (!Array.isArray(body?.inscripcion_ids) || body.inscripcion_ids.length === 0) {
    return NextResponse.json(
      { error: 'missing-fields', required: ['inscripcion_ids'] },
      { status: 400 },
    )
  }
  const grupoId = body.grupo_id ?? null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const { data, error } = await client.rpc('talleres_asignar_inscripciones_a_grupo', {
    p_inscripcion_ids: body.inscripcion_ids,
    p_grupo_id: grupoId,
  })

  if (error) {
    const mapped = mapRpcError(error as RpcError)
    return NextResponse.json(mapped, { status: 422 })
  }

  if (grupoId) {
    await revalidarPantallasDeGrupo(client, grupoId)
  }

  return NextResponse.json({
    asignadas: data?.asignadas ?? 0,
    ocupacion: data?.ocupacion ?? null,
    capacidad: data?.capacidad ?? null,
  })
}
