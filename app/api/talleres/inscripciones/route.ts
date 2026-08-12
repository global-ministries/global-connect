/**
 * PR15 — DT-054 — POST /api/talleres/inscripciones
 *
 * Create a new inscripcion. Capability `talleres_crecimiento.director.write`
 * or `coordinator.write`.
 */

import { NextRequest, NextResponse } from 'next/server'

import { requireTalleresApi } from '@/lib/platform/talleres/api-helpers'

interface Body {
  readonly taller_id: string
  readonly cohorte_id: string
  readonly persona_principal_id: string
  readonly companero_id?: string | null
  readonly link_type?: 'matrimonio' | 'novios' | null
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireTalleresApi('talleres_crecimiento.coordinator.write')
  if (!gate.ok) return gate.response

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid-body' }, { status: 400 })
  }
  if (!body?.taller_id || !body?.cohorte_id || !body?.persona_principal_id) {
    return NextResponse.json(
      { error: 'missing-fields', required: ['taller_id', 'cohorte_id', 'persona_principal_id'] },
      { status: 400 },
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const { data, error } = await client
    .from('taller_inscripciones')
    .insert({
      taller_id: body.taller_id,
      cohorte_id: body.cohorte_id,
      persona_principal_id: body.persona_principal_id,
      companero_id: body.companero_id ?? null,
      link_type: body.link_type ?? null,
      estado: 'pendiente',
    })
    .select('id, estado, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: 'internal', message: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
