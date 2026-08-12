/**
 * PR15 — DT-058 — POST /api/talleres/grupos/[id]/asignaciones
 *
 * Assign a persona to a grupo with rol='lider' or 'voluntario'.
 * Capability `talleres_crecimiento.director.write`.
 */

import { NextRequest, NextResponse } from 'next/server'

import { requireTalleresApi } from '@/lib/platform/talleres/api-helpers'

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
}

interface Body {
  readonly persona_id: string
  readonly rol: 'lider' | 'voluntario'
  readonly motivo?: string | null
}

const VALID_ROLES = new Set(['lider', 'voluntario'])

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const gate = await requireTalleresApi('talleres_crecimiento.director.write')
  if (!gate.ok) return gate.response

  const { id: grupoId } = await ctx.params
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid-body' }, { status: 400 })
  }
  if (!body?.persona_id || !body?.rol) {
    return NextResponse.json(
      { error: 'missing-fields', required: ['persona_id', 'rol'] },
      { status: 400 },
    )
  }
  if (!VALID_ROLES.has(body.rol)) {
    return NextResponse.json(
      { error: 'invalid-rol', allowed: ['lider', 'voluntario'] },
      { status: 400 },
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const { data, error } = await client
    .from('taller_grupo_asignaciones')
    .insert({
      grupo_id: grupoId,
      persona_id: body.persona_id,
      rol: body.rol,
      activo: true,
      motivo_retiro: body.motivo ?? null,
    })
    .select('id, grupo_id, persona_id, rol, activo, started_at')
    .single()

  if (error) {
    return NextResponse.json({ error: 'internal', message: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
