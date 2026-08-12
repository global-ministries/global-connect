/**
 * PR16 — DT-063 — POST /api/talleres/sesiones/[id]/cerrar
 *
 * Closes a session: en_curso → cerrada. Capability
 * `talleres_crecimiento.coordinator.write`. Sequential progression is
 * enforced server-side: skip-ahead (programada → cerrada) → 400.
 */

import { NextRequest, NextResponse } from 'next/server'

import { requireTalleresApi } from '@/lib/platform/talleres/api-helpers'

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
}

export async function POST(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const gate = await requireTalleresApi('talleres_crecimiento.coordinator.write')
  if (!gate.ok) return gate.response

  const { id } = await ctx.params

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
  // Sequential progression: must come from en_curso. Skip-ahead (programada
  // → cerrada) returns 400. terminal (cerrada/cancelada) returns 400 too.
  if (current.estado !== 'en_curso') {
    return NextResponse.json(
      { error: 'invalid-transition', from: current.estado, to: 'cerrada' },
      { status: 400 },
    )
  }

  const { data, error } = await client
    .from('taller_sesiones')
    .update({ estado: 'cerrada', version: undefined })
    .eq('id', id)
    .select('id, estado, version')
    .single()
  if (error) {
    return NextResponse.json({ error: 'internal', message: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
