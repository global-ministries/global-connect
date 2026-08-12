/**
 * PR15 — DT-055 — GET /api/talleres/inscripciones/[id]
 *
 * Returns a single inscripcion via the route-integration contract.
 */

import { NextRequest, NextResponse } from 'next/server'

import { requireTalleresApi } from '@/lib/platform/talleres/api-helpers'
import { toTallerView } from '@/lib/platform/talleres/route-integration'

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
}

interface InscRow {
  estado: 'pendiente' | 'aprobado' | 'no_aprobado' | 'completado'
  unit_estado: 'completado' | 'no_completado' | 'abandono' | null
  fecha_completitud: string | null
  taller_id: string
}

interface TallerRow {
  id: string
  nombre_snapshot: string
  tipo: 'individual' | 'pareja'
  edicion: string
  estado: 'borrador' | 'abierto' | 'en_curso' | 'cerrado' | 'cancelado'
}

interface PeriodoRow {
  id: string
  edicion_label: string
  fecha_cierre_real: string | null
}

interface SesionRow {
  id: string
}

interface CertRow {
  id: string
  codigo_verificacion: string
  created_at: string | null
}

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const gate = await requireTalleresApi('talleres_crecimiento.director.read')
  if (!gate.ok) return gate.response

  const { id } = await ctx.params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const [inscRes, certRes] = await Promise.all([
    client.from('taller_inscripciones').select('*').eq('id', id).maybeSingle(),
    client
      .from('taller_certificados')
      .select('id, codigo_verificacion, created_at')
      .eq('inscripcion_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (inscRes.error) {
    return NextResponse.json({ error: 'internal', message: inscRes.error.message }, { status: 500 })
  }
  const insc = inscRes.data as (InscRow & { taller_id: string }) | null
  if (!insc) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 })
  }

  // Fetch related taller + periodo + sesiones in parallel.
  const [tallerRes, periodoRes, sesionesRes] = await Promise.all([
    client.from('talleres_crecimiento_metadata').select('id, nombre_snapshot, tipo, edicion, estado').eq('id', insc.taller_id).maybeSingle(),
    client.from('taller_periodos_generales').select('id, edicion_label, fecha_cierre_real').eq('taller_id', insc.taller_id).maybeSingle(),
    client.from('taller_sesiones').select('id').eq('grupo.taller_id', insc.taller_id),
  ])

  const taller = (tallerRes.data as TallerRow | null) ?? null
  if (!taller) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 })
  }

  const view = toTallerView({
    taller,
    periodo: (periodoRes.data as PeriodoRow | null) ?? null,
    inscripcion: {
      estado: insc.estado,
      unit_estado: insc.unit_estado,
      fecha_completitud: insc.fecha_completitud,
    },
    certificado: (certRes.data as CertRow | null) ?? null,
    sesiones: (sesionesRes.data ?? []) as SesionRow[],
  })

  return NextResponse.json(view)
}
