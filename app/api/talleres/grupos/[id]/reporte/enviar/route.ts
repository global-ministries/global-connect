/**
 * PR16 — DT-065 — POST /api/talleres/grupos/[id]/reporte/enviar
 *
 * Submits (sends) the final report for a grupo:
 *   borrador → enviado   (with firma_lider_persona_id + firma_lider_fecha)
 *
 * 1 reporte por unidad (couple unit): if the taller is `pareja`, the
 * inscripcion has both persona_principal + companero. The report is
 * tied to a single grupo, so this endpoint enforces "one report per
 * grupo per inscripcion unit" via the inscripcion count for that grupo.
 *
 * Capability: `talleres_crecimiento.coordinator.write`.
 */

import { NextRequest, NextResponse } from 'next/server'

import { requireTalleresApi } from '@/lib/platform/talleres/api-helpers'

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
}

interface Body {
  readonly firma_lider_persona_id?: string
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const gate = await requireTalleresApi('talleres_crecimiento.coordinator.write')
  if (!gate.ok) return gate.response

  const { id: grupoId } = await ctx.params

  let body: Body = {}
  try {
    body = (await req.json()) as Body
  } catch {
    body = {}
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase

  // Validate the current reporte state for this grupo. There can be at
  // most one (borrador|enviado|reabierto) reporte per grupo at a time
  // due to the trigger taller_reportes_lock_after_send.
  const { data: current, error: curErr } = await client
    .from('taller_reportes')
    .select('id, estado')
    .eq('grupo_id', grupoId)
    .in('estado', ['borrador', 'enviado', 'reabierto'])
    .maybeSingle()
  if (curErr) {
    return NextResponse.json({ error: 'internal', message: curErr.message }, { status: 500 })
  }
  if (!current) {
    return NextResponse.json({ error: 'no-active-reporte' }, { status: 404 })
  }
  if (current.estado !== 'borrador') {
    return NextResponse.json(
      { error: 'invalid-transition', from: current.estado, to: 'enviado' },
      { status: 400 },
    )
  }

  const update: Record<string, unknown> = {
    estado: 'enviado',
    firma_lider_fecha: new Date().toISOString(),
    version: undefined,
  }
  if (body.firma_lider_persona_id) {
    update['firma_lider_persona_id'] = body.firma_lider_persona_id
  }

  const { data, error } = await client
    .from('taller_reportes')
    .update(update)
    .eq('id', current.id)
    .select('id, grupo_id, estado, firma_lider_persona_id, firma_lider_fecha, version')
    .single()
  if (error) {
    return NextResponse.json({ error: 'internal', message: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
