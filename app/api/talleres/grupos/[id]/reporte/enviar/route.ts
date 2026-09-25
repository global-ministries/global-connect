/**
 * T4 (odd/tasks/talleres-asistencia-lider.md) — POST
 * /api/talleres/grupos/[id]/reporte/enviar
 *
 * Sends the grupo's reporte (borrador/reabierto → enviado). This is a thin
 * wrapper over talleres_enviar_reporte (T1), the ONLY write path for the
 * envío transition: the function owns authorization (the grupo's líder, or
 * the supervisor with a capability scoped to the grupo's equipo), the
 * "every clase must be cerrada/cancelada" rule and the signature. The
 * route only:
 *
 *   1. applies the kill switch + session gate (no capability consultation —
 *      an assigned líder holding ZERO talleres capabilities must be able to
 *      send, criterio 7, same conclusion as T3's asistencia/cerrar);
 *   2. forwards the optional observaciones;
 *   3. translates whatever the function (or taller_reportes_lock_after_send)
 *      refused into HTTP + Spanish.
 *
 * The firma is NEVER taken from the body: talleres_enviar_reporte signs
 * with auth.uid() (criterio 3 — the líder signs their own send), so the old
 * `firma_lider_persona_id` field is gone. Reporte CREATION stays where it
 * was: this function does not create reportes.
 *
 * Body: {} or { observaciones?: string }.
 *
 * Success → 200 { reporte_id, estado } + revalidatePath(grupo) so the
 * screen shows `enviado` at once.
 */

import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

import { requireTalleresApiAuthenticated } from '@/lib/platform/talleres/api-helpers'
import { traducirErrorTalleres } from '@/lib/platform/talleres/errores-api'

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
}

interface Body {
  readonly observaciones?: unknown
}

const RUTA_GRUPO = '/talleres/[taller]/[edicion]/[grupo]'

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const gate = await requireTalleresApiAuthenticated()
  if (!gate.ok) return gate.response

  const { id: grupoId } = await ctx.params

  let body: Body = {}
  try {
    body = (await req.json()) as Body
  } catch {
    body = {}
  }
  const observaciones = typeof body?.observaciones === 'string' ? body.observaciones : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SQL function not in generated types
  const client: any = gate.supabase
  const { data, error } = await client.rpc('talleres_enviar_reporte', {
    p_grupo_id: grupoId,
    p_observaciones: observaciones,
  })
  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo enviar el reporte.')
    return NextResponse.json({ error: traducido.error, message: traducido.message }, {
      status: traducido.status,
    })
  }

  revalidatePath(RUTA_GRUPO, 'page')
  return NextResponse.json(data, { status: 200 })
}
