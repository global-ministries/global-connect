/**
 * PR16 — DT-065 — POST /api/talleres/grupos/[id]/reporte/reabrir
 *
 * Reopens a previously sent report:
 *   enviado → reabierto   (with reabierto_por_persona_id + reabierto_motivo)
 *
 * Required body: { reabierto_por_persona_id: string; reabierto_motivo: string }
 *
 * Capability: `talleres_crecimiento.director.write` (re-opening is an
 * admin/coordinator action; leaders cannot self-reopen).
 */

import { NextRequest, NextResponse } from 'next/server'

import { requireTalleresApi } from '@/lib/platform/talleres/api-helpers'

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
}

interface Body {
  readonly reabierto_por_persona_id: string
  readonly reabierto_motivo: string
}

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
  if (!body?.reabierto_por_persona_id || !body?.reabierto_motivo) {
    return NextResponse.json(
      {
        error: 'missing-fields',
        required: ['reabierto_por_persona_id', 'reabierto_motivo'],
      },
      { status: 400 },
    )
  }
  if (body.reabierto_motivo.trim().length < 8) {
    return NextResponse.json(
      { error: 'motivo-too-short', min_length: 8 },
      { status: 400 },
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase

  const { data: current, error: curErr } = await client
    .from('taller_reportes')
    .select('id, estado')
    .eq('grupo_id', grupoId)
    .eq('estado', 'enviado')
    .maybeSingle()
  if (curErr) {
    return NextResponse.json({ error: 'internal', message: curErr.message }, { status: 500 })
  }
  if (!current) {
    return NextResponse.json({ error: 'no-enviado-reporte' }, { status: 404 })
  }

  const { data, error } = await client
    .from('taller_reportes')
    .update({
      estado: 'reabierto',
      reabierto_por_persona_id: body.reabierto_por_persona_id,
      reabierto_motivo: body.reabierto_motivo,
      version: undefined,
    })
    .eq('id', current.id)
    .select(
      'id, grupo_id, estado, reabierto_por_persona_id, reabierto_motivo, version',
    )
    .single()
  if (error) {
    return NextResponse.json({ error: 'internal', message: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
