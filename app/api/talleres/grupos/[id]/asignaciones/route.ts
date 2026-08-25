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
  // director.write is the primary gate; a scoped coordinator (coordinator.write)
  // and a global admin (admin.manage) may also assign líderes — RLS confines the
  // coordinator's write to their own equipo.
  const gate = await requireTalleresApi('talleres_crecimiento.director.write', [
    'talleres_crecimiento.admin.manage',
    'talleres_crecimiento.coordinator.write',
  ])
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

/**
 * GET /api/talleres/grupos/[id]/asignaciones — list a grupo's ACTIVE asignaciones.
 *
 * Read gate: director.read primary; a scoped coordinator (coordinator.read or
 * coordinator.write) and a global admin (admin.manage) may also read — RLS
 * confines the coordinator's read to their own equipo. Only activo=true rows
 * are returned: a retired líder (soft-removed, activo=false) is history, not a
 * current member, so the UI's "Quitar" list stays clean.
 */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const gate = await requireTalleresApi('talleres_crecimiento.director.read', [
    'talleres_crecimiento.admin.manage',
    'talleres_crecimiento.coordinator.read',
    'talleres_crecimiento.coordinator.write',
  ])
  if (!gate.ok) return gate.response

  const { id: grupoId } = await ctx.params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const { data, error } = await client
    .from('taller_grupo_asignaciones')
    .select('id, grupo_id, persona_id, rol, activo, started_at')
    .eq('grupo_id', grupoId)
    .eq('activo', true)
    .order('started_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: 'internal', message: error.message }, { status: 500 })
  }
  return NextResponse.json({ asignaciones: data ?? [], count: (data ?? []).length })
}
