/**
 * PR16 — DT-064 — POST /api/talleres/sesiones/[id]/asistencia
 *
 * Records attendance for a session. Each (sesion_id, inscripcion_id)
 * tuple is logically unique — corrections are recorded as a NEW row
 * with `correccion_de_asistencia_id` pointing to the original row
 * (self-FK). Original rows are never updated/deleted; this guarantees
 * the immutability invariant for attendance history (auditor trail).
 *
 * Capability: `talleres_crecimiento.coordinator.write`.
 *
 * Body: { inscripcion_id: string; persona_id: string; estado:
 * 'presente'|'ausente'|'no_aplica'; correccion_de_asistencia_id?:
 * string }
 *
 *  - When `correccion_de_asistencia_id` is set, the new row is
 *    treated as a correction. The referenced row must exist.
 *  - When omitted, the new row is a fresh attendance record.
 */

import { NextRequest, NextResponse } from 'next/server'

import { requireTalleresApi } from '@/lib/platform/talleres/api-helpers'

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
}

interface Body {
  readonly inscripcion_id: string
  readonly persona_id: string
  readonly estado: 'presente' | 'ausente' | 'no_aplica'
  readonly correccion_de_asistencia_id?: string
}

const VALID_ESTADOS = new Set(['presente', 'ausente', 'no_aplica'])

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const gate = await requireTalleresApi('talleres_crecimiento.coordinator.write')
  if (!gate.ok) return gate.response

  const { id: sesionId } = await ctx.params

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid-body' }, { status: 400 })
  }
  if (!body?.inscripcion_id || !body?.persona_id || !body?.estado) {
    return NextResponse.json(
      {
        error: 'missing-fields',
        required: ['inscripcion_id', 'persona_id', 'estado'],
      },
      { status: 400 },
    )
  }
  if (!VALID_ESTADOS.has(body.estado)) {
    return NextResponse.json(
      { error: 'invalid-estado', allowed: ['presente', 'ausente', 'no_aplica'] },
      { status: 400 },
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase

  // Validate sesion exists and is in a state that accepts attendance.
  const { data: sesion, error: sesErr } = await client
    .from('taller_sesiones')
    .select('id, estado')
    .eq('id', sesionId)
    .maybeSingle()
  if (sesErr) {
    return NextResponse.json({ error: 'internal', message: sesErr.message }, { status: 500 })
  }
  if (!sesion) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 })
  }
  if (sesion.estado !== 'en_curso' && sesion.estado !== 'cerrada') {
    return NextResponse.json(
      { error: 'invalid-sesion-estado', estado: sesion.estado },
      { status: 400 },
    )
  }

  // If this is a correction, verify the original row exists.
  if (body.correccion_de_asistencia_id) {
    const { data: original, error: origErr } = await client
      .from('taller_asistencias')
      .select('id')
      .eq('id', body.correccion_de_asistencia_id)
      .maybeSingle()
    if (origErr) {
      return NextResponse.json({ error: 'internal', message: origErr.message }, { status: 500 })
    }
    if (!original) {
      return NextResponse.json(
        { error: 'correccion-target-not-found' },
        { status: 400 },
      )
    }
  }

  // Insert. We do NOT touch existing rows (immutability).
  const insert = {
    sesion_id: sesionId,
    inscripcion_id: body.inscripcion_id,
    persona_id: body.persona_id,
    estado: body.estado,
    correccion_de_asistencia_id: body.correccion_de_asistencia_id ?? null,
    version: undefined,
  }
  const { data, error } = await client
    .from('taller_asistencias')
    .insert(insert)
    .select('id, sesion_id, inscripcion_id, persona_id, estado, correccion_de_asistencia_id, version')
    .single()
  if (error) {
    return NextResponse.json({ error: 'internal', message: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
