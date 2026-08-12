/**
 * PR15 — DT-053 — POST /api/talleres/workshops/[id]/transition
 *
 * State machine transition for a taller:
 *   borrador → abierto → en_curso → cerrado | cancelado
 *
 * Capability `talleres_crecimiento.director.write` (admins/coordinators).
 */

import { NextRequest, NextResponse } from 'next/server'

import { requireTalleresApi } from '@/lib/platform/talleres/api-helpers'

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
}

interface Body {
  readonly target: string
}

const VALID_TARGETS = new Set([
  'borrador',
  'abierto',
  'en_curso',
  'cerrado',
  'cancelado',
])

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const gate = await requireTalleresApi('talleres_crecimiento.director.write')
  if (!gate.ok) return gate.response

  const { id } = await ctx.params
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid-body' }, { status: 400 })
  }
  if (!body?.target || !VALID_TARGETS.has(body.target)) {
    return NextResponse.json({ error: 'invalid-target' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const { data, error } = await client
    .from('talleres_crecimiento_metadata')
    .update({ estado: body.target, version: undefined })
    .eq('id', id)
    .select('id, estado, version')
    .single()

  if (error) {
    return NextResponse.json({ error: 'internal', message: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 })
  }
  return NextResponse.json(data)
}
