/**
 * T3 — POST /api/talleres/sesiones/[id]/asistencia
 *
 * Records attendance for one clase. This is a thin wrapper over
 * talleres_registrar_asistencia (T1), the ONLY write path for
 * taller_asistencias: the function owns authorization, the estado domain,
 * the motivo rules and the programada → en_curso transition. The route only
 *
 *   1. applies the kill switch + session gate (no capability consultation —
 *      an assigned líder with ZERO capabilities must be able to pass list,
 *      criterio 1);
 *   2. validates the batch shape before touching the DB;
 *   3. translates whatever the function refused into HTTP + Spanish.
 *
 * Body: { marcas: [{ inscripcion_id, estado: 'presente' | 'ausente',
 * motivo? }] } — motivo only makes sense for ausente.
 *
 * Success → 201 { presentes, ausentes, total } + revalidatePath(grupo).
 */

import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

import { requireTalleresApiAuthenticated } from '@/lib/platform/talleres/api-helpers'
import { traducirErrorTalleres } from '@/lib/platform/talleres/errores-api'

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
}

interface Marca {
  readonly inscripcion_id: string
  readonly estado: 'presente' | 'ausente'
  readonly motivo?: string
}

interface Body {
  readonly marcas: readonly Marca[]
}

const ESTADOS = new Set(['presente', 'ausente'])
const RUTA_GRUPO = '/talleres/[taller]/[edicion]/[grupo]'

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const gate = await requireTalleresApiAuthenticated()
  if (!gate.ok) return gate.response

  const { id: sesionId } = await ctx.params

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid-body' }, { status: 400 })
  }

  const marcas = body?.marcas
  if (!Array.isArray(marcas) || marcas.length === 0) {
    return NextResponse.json(
      { error: 'missing-fields', required: ['marcas'] },
      { status: 400 },
    )
  }
  for (const marca of marcas) {
    const inscripcionId = marca?.inscripcion_id
    if (typeof inscripcionId !== 'string' || inscripcionId.length === 0) {
      return NextResponse.json(
        { error: 'invalid-marcas', required: ['inscripcion_id'] },
        { status: 400 },
      )
    }
    if (!ESTADOS.has(marca?.estado)) {
      return NextResponse.json(
        { error: 'invalid-estado', allowed: ['presente', 'ausente'] },
        { status: 400 },
      )
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SQL function not in generated types
  const client: any = gate.supabase
  const { data, error } = await client.rpc('talleres_registrar_asistencia', {
    p_sesion_id: sesionId,
    p_marcas: marcas,
  })
  if (error) {
    const traducido = traducirErrorTalleres(error, 'No se pudo guardar la asistencia.')
    return NextResponse.json({ error: traducido.error, message: traducido.message }, {
      status: traducido.status,
    })
  }

  revalidatePath(RUTA_GRUPO, 'page')
  return NextResponse.json(data, { status: 201 })
}
