/**
 * T3 — POST /api/talleres/sesiones/[id]/cerrar
 *
 * Closes one clase. Thin wrapper over talleres_cerrar_clase (T1): the
 * function decides whether THIS caller may close THIS sesión (líder of the
 * grupo, or the supervisor that already covers them) and performs the
 * transition. Idempotent — closing an already cerrada sesión succeeds.
 *
 * The route only applies the kill switch + session gate, calls the function
 * and translates a refusal. Success → 200 { sesion_id, estado } +
 * revalidatePath(grupo) so the screen flips to the read view at once.
 */

import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

import { requireTalleresApiAuthenticated } from '@/lib/platform/talleres/api-helpers'
import { traducirErrorTalleres } from '@/lib/platform/talleres/errores-api'

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
}

const RUTA_GRUPO = '/talleres/[taller]/[edicion]/[grupo]'

export async function POST(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const gate = await requireTalleresApiAuthenticated()
  if (!gate.ok) return gate.response

  const { id: sesionId } = await ctx.params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SQL function not in generated types
  const client: any = gate.supabase
  const { data, error } = await client.rpc('talleres_cerrar_clase', {
    p_sesion_id: sesionId,
  })
  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo cerrar la clase.')
    return NextResponse.json({ error: traducido.error, message: traducido.message }, {
      status: traducido.status,
    })
  }

  revalidatePath(RUTA_GRUPO, 'page')
  return NextResponse.json(data, { status: 200 })
}
