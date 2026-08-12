/**
 * PR16 — DT-066 — GET /api/talleres/certificados
 *
 * Returns certificados for an inscripcion. Filter via query param:
 *   - `inscripcion_id` (required) — primary key to look up
 *
 * Capability: `talleres_crecimiento.director.read` (or metrics.read
 * superset). The public verification endpoint lives at
 * `/api/public/verificar-certificado/[codigo]` and does NOT require
 * auth — it never returns sensitive metadata.
 */

import { NextRequest, NextResponse } from 'next/server'

import { requireTalleresApi } from '@/lib/platform/talleres/api-helpers'

interface CertRow {
  id: string
  inscripcion_id: string
  taller_id: string
  persona_id: string
  codigo_verificacion: string
  nombre_taller_snapshot: string
  nombre_participante_snapshot: string
  fecha_completitud: string
  firmantes_snapshot: unknown
  pdf_storage_path: string | null
  revocado_at: string | null
  motivo_revocacion: string | null
  created_at: string
  version: number
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = await requireTalleresApi('talleres_crecimiento.director.read')
  if (!gate.ok) return gate.response

  const inscripcionId = req.nextUrl.searchParams.get('inscripcion_id')
  if (!inscripcionId) {
    return NextResponse.json({ error: 'missing-inscripcion-id' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const { data, error } = await client
    .from('taller_certificados')
    .select(
      'id, inscripcion_id, taller_id, persona_id, codigo_verificacion, nombre_taller_snapshot, nombre_participante_snapshot, fecha_completitud, firmantes_snapshot, pdf_storage_path, revocado_at, motivo_revocacion, version, created_at',
    )
    .eq('inscripcion_id', inscripcionId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'internal', message: error.message }, { status: 500 })
  }

  return NextResponse.json({
    certificados: (data ?? []) as CertRow[],
    count: (data ?? []).length,
  })
}
