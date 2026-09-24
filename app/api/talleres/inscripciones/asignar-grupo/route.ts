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
 * CORRECTION (post-T4 review, item 2): the original version only
 * revalidated when `grupo_id` was truthy (assign) — unassign revalidated
 * NOTHING, and a reassign never revalidated the PREVIOUS grupo's page,
 * so its roster/Grupo column stayed stale. Fixed: before calling the
 * RPC, the route reads every affected inscripción's CURRENT `taller_id`
 * (== edición id, same non-obvious FK the rest of this codebase already
 * documents) and `grupo_id`. After a successful call it revalidates the
 * edición route always, plus every DISTINCT grupo route touched — the
 * old grupo(s) it read before the call, union the new `grupo_id` when
 * assigning. Mirrors ae4bfb7's fix for the edición open/close actions
 * (resolve the taller's slug from already-known ids, a couple of extra
 * reads, to hit BOTH the new and old routes).
 *
 * Item 5 (dedupe): duplicate ids in `inscripcion_ids` used to fail
 * P0002 in the RPC (its "every id must exist" check compares the input
 * length against the count of DISTINCT rows found, so 3x the same id
 * looks like 2 missing rows). The route dedupes before calling the RPC;
 * the RPC itself is ALSO fixed to dedupe (T1 correction migration
 * 20260924140000) so any other caller is safe too.
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

interface PreviaRow {
  readonly id: string
  readonly taller_id: string
  readonly grupo_id: string | null
}

/**
 * Reads the CURRENT (pre-update) taller_id (== edición id) and grupo_id
 * of every affected inscripción — must run BEFORE the RPC call, since
 * the RPC overwrites grupo_id.
 */
async function leerEstadoPrevio(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  client: any,
  ids: readonly string[],
): Promise<readonly PreviaRow[]> {
  const { data } = await client
    .from('taller_inscripciones')
    .select('id, taller_id, grupo_id')
    .in('id', ids)
  return (data ?? []) as PreviaRow[]
}

/** Resolves the taller slug for an edición id, or null if it can't resolve. */
async function resolverSlugDeEdicion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  client: any,
  edicionId: string,
): Promise<string | null> {
  const { data: edicion } = await client
    .from('taller_ediciones')
    .select('taller_id')
    .eq('id', edicionId)
    .maybeSingle()
  const tallerAbstractoId = edicion?.taller_id
  if (!tallerAbstractoId) return null

  const { data: taller } = await client
    .from('talleres')
    .select('slug')
    .eq('id', tallerAbstractoId)
    .maybeSingle()
  return taller?.slug ?? null
}

/**
 * Revalidates every screen touched by this write: the edición route
 * always, plus every DISTINCT grupo route affected — the grupo(s) the
 * inscripciones were in BEFORE the call, union the new target grupo
 * (when assigning). `previas` must have been read before the RPC call.
 */
async function revalidarPantallas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  client: any,
  previas: readonly PreviaRow[],
  nuevoGrupoId: string | null,
): Promise<void> {
  const edicionId = previas[0]?.taller_id
  if (!edicionId) return
  const slug = await resolverSlugDeEdicion(client, edicionId)
  if (!slug) return

  revalidatePath(`/talleres/${slug}/${edicionId}`)

  const gruposTocados = new Set<string>()
  for (const p of previas) {
    if (p.grupo_id) gruposTocados.add(p.grupo_id)
  }
  if (nuevoGrupoId) gruposTocados.add(nuevoGrupoId)

  for (const grupoId of gruposTocados) {
    revalidatePath(`/talleres/${slug}/${edicionId}/${grupoId}`)
  }
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
  // Item 5 — dedupe before calling the RPC (duplicates otherwise fail
  // P0002 there; the RPC is also fixed independently, see this file's
  // header).
  const ids = Array.from(new Set(body.inscripcion_ids))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase

  // Read the PRE-update state before the RPC runs — it's the only way to
  // learn the previous grupo(s), needed to revalidate their routes too.
  const previas = await leerEstadoPrevio(client, ids)

  const { data, error } = await client.rpc('talleres_asignar_inscripciones_a_grupo', {
    p_inscripcion_ids: ids,
    p_grupo_id: grupoId,
  })

  if (error) {
    const mapped = mapRpcError(error as RpcError)
    return NextResponse.json(mapped, { status: 422 })
  }

  await revalidarPantallas(client, previas, grupoId)

  return NextResponse.json({
    asignadas: data?.asignadas ?? 0,
    ocupacion: data?.ocupacion ?? null,
    capacidad: data?.capacidad ?? null,
  })
}
