/**
 * PR15 — DT-057b — PATCH /api/talleres/grupos/[id]
 *
 * Edit a grupo's editable fields (nombre, capacidad).
 *
 * director.write is the primary gate; a scoped coordinator (coordinator.write)
 * and a global admin (admin.manage) may also edit grupos — RLS confines the
 * coordinator's UPDATE to their own equipo, so this app gate only decides
 * whether the request is let through at all.
 *
 * Soft/reversible by design: this route never physically deletes and only
 * writes a partial patch of the whitelisted fields. `version` is intentionally
 * NOT touched — PostgREST cannot express `version = version + 1` without an RPC
 * (a migration), and the ZERO-migration contract forbids that; the updated_at
 * trigger records the change. We use maybeSingle() so an RLS-invisible row
 * resolves to a clean 404 instead of a PostgREST "no rows" error.
 */

import { NextRequest, NextResponse } from 'next/server'

import { requireTalleresApi } from '@/lib/platform/talleres/api-helpers'

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
}

interface PatchBody {
  readonly nombre?: string
  readonly capacidad?: number
}

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const gate = await requireTalleresApi('talleres_crecimiento.director.write', [
    'talleres_crecimiento.admin.manage',
    'talleres_crecimiento.coordinator.write',
  ])
  if (!gate.ok) return gate.response

  const { id: grupoId } = await ctx.params
  let body: PatchBody
  try {
    body = (await req.json()) as PatchBody
  } catch {
    return NextResponse.json({ error: 'invalid-body' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (typeof body?.nombre === 'string' && body.nombre.trim().length > 0) {
    patch.nombre = body.nombre.trim()
  }
  if (body?.capacidad !== undefined) {
    if (typeof body.capacidad !== 'number' || body.capacidad <= 0) {
      return NextResponse.json({ error: 'invalid-capacidad' }, { status: 400 })
    }
    patch.capacidad = body.capacidad
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: 'no-fields', updatable: ['nombre', 'capacidad'] },
      { status: 400 },
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const { data, error } = await client
    .from('taller_grupos')
    .update(patch)
    .eq('id', grupoId)
    .select('id, cohorte_id, nombre, capacidad, estado, completed_at')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'internal', message: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 })
  }
  return NextResponse.json({ grupo: data })
}

/**
 * DELETE /api/talleres/grupos/[id] — SOFT cancel.
 *
 * This route never physically deletes a grupo. It flips estado to 'cancelado'
 * (a schema-valid, reversible transition) so the grupo and its history stay in
 * the database. RLS DELETE on taller_grupos is director/admin-only, but the
 * UPDATE policy is open to the scoped coordinator — so expressing "cancelar" as
 * an UPDATE is what lets a coordinator reverse a group within their own equipo
 * without ever touching physical rows. Same gate + maybeSingle()-404 shape as
 * PATCH; `version` is deliberately left untouched (ZERO-migration contract).
 */
export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const gate = await requireTalleresApi('talleres_crecimiento.director.write', [
    'talleres_crecimiento.admin.manage',
    'talleres_crecimiento.coordinator.write',
  ])
  if (!gate.ok) return gate.response

  const { id: grupoId } = await ctx.params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const { data, error } = await client
    .from('taller_grupos')
    .update({ estado: 'cancelado' })
    .eq('id', grupoId)
    .select('id, cohorte_id, nombre, capacidad, estado, completed_at')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'internal', message: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 })
  }
  return NextResponse.json({ grupo: data })
}
