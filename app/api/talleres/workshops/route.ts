/**
 * PR15 — DT-051 — GET /api/talleres/workshops
 *
 * Lists talleres_crecimiento_metadata rows (workshops). Read-only;
 * capability `talleres_crecimiento.director.read` (with `metrics.read`
 * superset via the API helper). Filters via query params:
 *   - `estado` (optional) — filter by estado (borrador|abierto|en_curso|cerrado|cancelado)
 *   - `limit` (optional, default 50, max 200)
 *
 * Returns the route-integration contract view (non-sensitive projection).
 */

import { NextRequest, NextResponse } from 'next/server'

import { requireTalleresApi } from '@/lib/platform/talleres/api-helpers'
import { toTallerView } from '@/lib/platform/talleres/route-integration'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = await requireTalleresApi('talleres_crecimiento.director.read')
  if (!gate.ok) return gate.response

  const { searchParams } = req.nextUrl
  const estado = searchParams.get('estado') ?? null
  const limitParam = Number(searchParams.get('limit') ?? '50')
  const limit = Math.min(Math.max(1, Number.isFinite(limitParam) ? limitParam : 50), 200)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  let query = client.from('talleres_crecimiento_metadata').select(
    'id, nombre_snapshot, tipo, edicion, estado',
  )
  if (estado) query = query.eq('estado', estado)
  query = query.limit(limit)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: 'internal', message: error.message }, { status: 500 })
  }

  // Project each row to the route-integration contract view. Most sub-fields
  // (periodo, inscripcion, certificado) are not loaded in this listing query
  // by design — callers fetch detail via /workshops/[id] when needed.
  const views = (data ?? []).map((row: {
    id: string
    nombre_snapshot: string
    tipo: 'individual' | 'pareja'
    edicion: string
    estado: 'borrador' | 'abierto' | 'en_curso' | 'cerrado' | 'cancelado'
  }) => toTallerView({
    taller: {
      id: row.id,
      nombre_snapshot: row.nombre_snapshot,
      tipo: row.tipo,
      edicion: row.edicion,
      estado: row.estado,
    },
    periodo: null,
    inscripcion: null,
    certificado: null,
    sesiones: [],
  }))

  return NextResponse.json({ talleres: views, count: views.length })
}
