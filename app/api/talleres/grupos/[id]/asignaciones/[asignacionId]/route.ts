/**
 * PR15 — DT-058b — DELETE /api/talleres/grupos/[id]/asignaciones/[asignacionId]
 *
 * "Quitar líder" — SOFT / reversible removal of a grupo asignación.
 *
 * This route never physically deletes. It writes activo=false, ended_at=now(),
 * motivo_retiro=<motivo>, preserving the row as history so a removal can be
 * audited and (by re-assigning) reversed. RLS DELETE on taller_grupo_asignaciones
 * is director/admin-only; the UPDATE policy is open to the scoped coordinator,
 * so expressing "quitar" as an UPDATE is what lets a coordinator retire a líder
 * inside their own equipo. The schema requires motivo_retiro whenever
 * activo=false, so `motivo` is mandatory (400 if absent).
 *
 * director.write primary gate; coordinator.write / admin.manage also accepted.
 * `version` is deliberately left untouched (ZERO-migration contract).
 * maybeSingle()-404 keeps an RLS-invisible row from surfacing a PostgREST error.
 */

import { NextRequest, NextResponse } from 'next/server'

import { requireTalleresApi } from '@/lib/platform/talleres/api-helpers'

interface RouteContext {
  readonly params: Promise<{ readonly id: string; readonly asignacionId: string }>
}

interface Body {
  readonly motivo?: string
}

export async function DELETE(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const gate = await requireTalleresApi('talleres_crecimiento.director.write', [
    'talleres_crecimiento.admin.manage',
    'talleres_crecimiento.coordinator.write',
  ])
  if (!gate.ok) return gate.response

  const { asignacionId } = await ctx.params
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid-body' }, { status: 400 })
  }
  const motivo = typeof body?.motivo === 'string' ? body.motivo.trim() : ''
  if (motivo.length === 0) {
    return NextResponse.json(
      { error: 'missing-motivo', required: ['motivo'] },
      { status: 400 },
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const { data, error } = await client
    .from('taller_grupo_asignaciones')
    .update({ activo: false, ended_at: new Date().toISOString(), motivo_retiro: motivo })
    .eq('id', asignacionId)
    .select('id, grupo_id, persona_id, rol, activo, ended_at, motivo_retiro')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'internal', message: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 })
  }
  return NextResponse.json({ asignacion: data })
}
