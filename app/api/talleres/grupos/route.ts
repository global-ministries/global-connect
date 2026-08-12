/**
 * PR15 — DT-057 — /api/talleres/grupos
 *
 * POST: create a new grupo inside a cohorte.
 * GET:  list grupos (filter by cohorte_id query param).
 *
 * Capability `talleres_crecimiento.director.write` (POST) / `.director.read` (GET).
 */

import { NextRequest, NextResponse } from 'next/server'

import { requireTalleresApi } from '@/lib/platform/talleres/api-helpers'

interface Body {
  readonly cohorte_id: string
  readonly nombre: string
  readonly capacidad: number
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireTalleresApi('talleres_crecimiento.director.write')
  if (!gate.ok) return gate.response

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid-body' }, { status: 400 })
  }
  if (!body?.cohorte_id || !body?.nombre || !body?.capacidad) {
    return NextResponse.json(
      { error: 'missing-fields', required: ['cohorte_id', 'nombre', 'capacidad'] },
      { status: 400 },
    )
  }
  if (body.capacidad <= 0) {
    return NextResponse.json({ error: 'invalid-capacidad' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const { data, error } = await client
    .from('taller_grupos')
    .insert({
      cohorte_id: body.cohorte_id,
      nombre: body.nombre,
      capacidad: body.capacidad,
      estado: 'activo',
    })
    .select('id, cohorte_id, nombre, capacidad, estado')
    .single()

  if (error) {
    return NextResponse.json({ error: 'internal', message: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = await requireTalleresApi('talleres_crecimiento.director.read')
  if (!gate.ok) return gate.response

  const cohorteId = req.nextUrl.searchParams.get('cohorte_id')
  if (!cohorteId) {
    return NextResponse.json({ error: 'missing-cohorte-id' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const { data, error } = await client
    .from('taller_grupos')
    .select('id, cohorte_id, nombre, capacidad, estado, completed_at')
    .eq('cohorte_id', cohorteId)
    .order('nombre', { ascending: true })

  if (error) {
    return NextResponse.json({ error: 'internal', message: error.message }, { status: 500 })
  }
  return NextResponse.json({ grupos: data ?? [], count: (data ?? []).length })
}
