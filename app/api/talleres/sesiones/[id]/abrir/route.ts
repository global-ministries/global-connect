/**
 * PR16 — DT-063 — POST /api/talleres/sesiones/[id]/abrir
 *
 * Opens a session: programada → en_curso. Capability
 * `talleres_crecimiento.coordinator.write`.
 *
 * Body (optional): { fecha_realizada?: 'YYYY-MM-DD' } — defaults to today.
 */

import { NextRequest, NextResponse } from 'next/server'

import { requireTalleresApi } from '@/lib/platform/talleres/api-helpers'

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
}

interface Body {
  readonly fecha_realizada?: string
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const gate = await requireTalleresApi('talleres_crecimiento.coordinator.write')
  if (!gate.ok) return gate.response

  const { id } = await ctx.params

  let body: Body = {}
  try {
    body = (await req.json()) as Body
  } catch {
    body = {}
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const { data: current, error: curErr } = await client
    .from('taller_sesiones')
    .select('estado')
    .eq('id', id)
    .maybeSingle()
  if (curErr) {
    return NextResponse.json({ error: 'internal', message: curErr.message }, { status: 500 })
  }
  if (!current) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 })
  }
  if (current.estado !== 'programada') {
    return NextResponse.json(
      { error: 'invalid-transition', from: current.estado, to: 'en_curso' },
      { status: 400 },
    )
  }

  const patch: Record<string, unknown> = {
    estado: 'en_curso',
    version: undefined,
  }
  if (body.fecha_realizada) {
    patch['fecha_realizada'] = body.fecha_realizada
  } else {
    patch['fecha_realizada'] = new Date().toISOString().slice(0, 10)
  }

  const { data, error } = await client
    .from('taller_sesiones')
    .update(patch)
    .eq('id', id)
    .select('id, estado, fecha_realizada, version')
    .single()
  if (error) {
    return NextResponse.json({ error: 'internal', message: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
