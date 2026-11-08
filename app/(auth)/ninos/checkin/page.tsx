/**
 * Niños — /ninos/checkin (RSC), odd/tasks/ninos-checkin.md N4.
 *
 * Sunday check-in at the table. Same gate as Familias:
 * ninos_puede_operar_algun_area() (Anfitriones, area coordinators, Directora
 * de Niños, admin, pastor); everyone else gets a 404. The service (turno and
 * date) lives in the query (?turno=&fecha=) so a reload keeps it; ?q=&padre=
 * selects a family just registered from here. The services are the Sunday
 * turnos plus the Niños events planned that day (cargarTurnosDelServicio).
 * The screen is on design-system v2 (odd/tasks/ninos-v2.md, N2a): CheckinClient renders the
 * page frame; the campus name feeds its summary line.
 */
import { notFound } from 'next/navigation'

import { CheckinClient } from '@/components/ninos/checkin-client'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { resolverServicio } from '@/lib/platform/ninos/checkin'
import { nombreCampus } from '@/lib/platform/ninos/checkin-vista'
import type { SalonFila } from '@/lib/platform/ninos/familias-vista'
import { cargarTurnosDelServicio } from '@/lib/platform/ninos/turnos-servicio'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Check-in — Niños' }

type Props = {
  readonly searchParams: Promise<{ readonly turno?: string; readonly fecha?: string; readonly q?: string; readonly padre?: string }>
}

export default async function NinosCheckinPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient()
  const { data: puede } = await supabase.rpc('ninos_puede_operar_algun_area')
  if (!puede) notFound()

  const query = await searchParams
  const { data: salones } = await supabase
    .from('ninos_salones')
    .select('id, nombre, area, edad_min_meses, edad_max_meses, grado_min, grado_max, es_necesidades_especiales, activo, orden, campus_id')
    .eq('activo', true)
    .order('orden')

  const campus = [...new Set((salones ?? []).map((s) => s.campus_id))]
  const hoy = hoyEnCaracas()
  const [{ turnos: listaTurnos, fecha }, { data: campusFilas }] = await Promise.all([
    cargarTurnosDelServicio(supabase, campus, query.fecha, hoy),
    campus.length
      ? supabase.from('campus').select('id, nombre').in('id', campus).order('nombre')
      : { data: [] as { id: string; nombre: string }[] },
  ])
  const servicio = resolverServicio({ turno: query.turno, fecha }, listaTurnos, hoy)

  return (
    <CheckinClient
      salones={(salones ?? []) as SalonFila[]}
      turnos={listaTurnos}
      servicio={servicio}
      campus={nombreCampus((campusFilas ?? []).map((c) => c.nombre))}
      consultaInicial={query.q}
      padreInicial={query.padre}
    />
  )
}
