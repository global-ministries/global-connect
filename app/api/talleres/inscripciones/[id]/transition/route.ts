/**
 * PR15 — DT-056 — POST /api/talleres/inscripciones/[id]/transition
 *
 * Inscripcion state transitions:
 *   pendiente → aprobado | no_aprobado
 *   aprobado  → completado
 *   no_aprobado → pendiente (only while periodo activo)
 *
 * Capability: director.write or coordinator.write.
 */

import { NextRequest, NextResponse } from 'next/server'

import { requireTalleresApi } from '@/lib/platform/talleres/api-helpers'

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
}

interface Body {
  readonly target: 'aprobado' | 'no_aprobado' | 'completado' | 'pendiente'
  readonly motivo?: string
}

const VALID_TRANSITIONS: Readonly<Record<string, ReadonlyArray<string>>> = {
  pendiente: ['aprobado', 'no_aprobado'],
  aprobado: ['completado'],
  no_aprobado: ['pendiente'],
  completado: [], // terminal
}

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
  if (!body?.target) {
    return NextResponse.json({ error: 'missing-target' }, { status: 400 })
  }
  if (body.target === 'no_aprobado' && (!body.motivo || body.motivo.trim().length === 0)) {
    return NextResponse.json({ error: 'motivo-required-for-no-aprobado' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const { data: current, error: curErr } = await client
    .from('taller_inscripciones')
    .select('estado')
    .eq('id', id)
    .maybeSingle()
  if (curErr) {
    return NextResponse.json({ error: 'internal', message: curErr.message }, { status: 500 })
  }
  if (!current) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 })
  }

  const allowed = VALID_TRANSITIONS[current.estado as string] ?? []
  if (!allowed.includes(body.target)) {
    return NextResponse.json(
      { error: 'invalid-transition', from: current.estado, to: body.target },
      { status: 400 },
    )
  }

  const patch: Record<string, unknown> = {
    estado: body.target,
    version: undefined,
  }
  if (body.target === 'completado') patch['fecha_completitud'] = new Date().toISOString()
  if (body.target === 'no_aprobado') patch['motivo_no_aprobado'] = body.motivo
  if (body.target === 'pendiente') patch['motivo_no_aprobado'] = null

  const { data, error } = await client
    .from('taller_inscripciones')
    .update(patch)
    .eq('id', id)
    .select('id, estado, version')
    .single()
  if (error) {
    return NextResponse.json({ error: 'internal', message: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
