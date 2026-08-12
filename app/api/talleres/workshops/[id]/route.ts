/**
 * PR15 — DT-052 — GET /api/talleres/workshops/[id]
 *
 * Returns a single taller via the route-integration contract view.
 */

import { NextRequest, NextResponse } from 'next/server'

import { requireTalleresApi } from '@/lib/platform/talleres/api-helpers'
import { toTallerView } from '@/lib/platform/talleres/route-integration'

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
}

interface TallerRow {
  id: string
  nombre_snapshot: string
  tipo: 'individual' | 'pareja'
  edicion: string
  estado: 'borrador' | 'abierto' | 'en_curso' | 'cerrado' | 'cancelado'
}

interface GrupoRow {
  id: string
}

interface InscRow {
  estado: 'pendiente' | 'aprobado' | 'no_aprobado' | 'completado'
  unit_estado: 'completado' | 'no_completado' | 'abandono' | null
  fecha_completitud: string | null
}

interface CertRow {
  id: string
  codigo_verificacion: string
  created_at: string | null
}

interface PeriodoRow {
  id: string
  edicion_label: string
  fecha_cierre_real: string | null
}

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const gate = await requireTalleresApi('talleres_crecimiento.director.read')
  if (!gate.ok) return gate.response

  const { id } = await ctx.params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase

  // Parallelize the four reads.
  const [tallerRes, periodoRes, sesionesRes, inscRes, certRes] = await Promise.all([
    client.from('talleres_crecimiento_metadata').select('id, nombre_snapshot, tipo, edicion, estado').eq('id', id).maybeSingle(),
    client.from('taller_periodos_generales').select('id, edicion_label, fecha_cierre_real').eq('taller_id', id).maybeSingle(),
    client.from('taller_sesiones').select('id').eq('grupo.taller_id', id),
    client
      .from('taller_inscripciones')
      .select('estado, unit_estado, fecha_completitud')
      .eq('taller_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from('taller_certificados')
      .select('id, codigo_verificacion, created_at')
      .eq('taller_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (tallerRes.error) {
    return NextResponse.json({ error: 'internal', message: tallerRes.error.message }, { status: 500 })
  }
  const taller = tallerRes.data as TallerRow | null
  if (!taller) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 })
  }

  const periodo = (periodoRes.data as PeriodoRow | null) ?? null
  const sesiones = ((sesionesRes.data ?? []) as GrupoRow[]).length // placeholder; we only need count
  const insc = (inscRes.data as InscRow | null) ?? null
  const cert = (certRes.data as CertRow | null) ?? null

  const view = toTallerView({
    taller,
    periodo,
    inscripcion: insc,
    certificado: cert,
    sesiones: Array.from({ length: sesiones }, () => ({ id: '' })),
  })

  return NextResponse.json(view)
}
