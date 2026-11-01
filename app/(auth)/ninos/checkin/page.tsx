/**
 * Niños — /ninos/checkin (RSC), odd/tasks/ninos-checkin.md N4.
 *
 * Sunday check-in at the table. Same gate as Familias:
 * ninos_puede_operar_algun_area() (Anfitriones, area coordinators, Directora
 * de Niños, admin, pastor); everyone else gets a 404. The service (turno and
 * date) lives in the query (?turno=&fecha=) so a reload keeps it; ?q=&padre=
 * selects a family just registered from here. The screen is on
 * design-system v2 (odd/tasks/ninos-v2.md, N2a): CheckinClient renders the
 * page frame; the campus name feeds its summary line.
 */
import { notFound } from 'next/navigation'

import { CheckinClient } from '@/components/ninos/checkin-client'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { resolverServicio, type TurnoFila } from '@/lib/platform/ninos/checkin'
import { nombreCampus } from '@/lib/platform/ninos/checkin-vista'
import type { SalonFila } from '@/lib/platform/ninos/familias-vista'
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
  const [{ data: turnos }, { data: campusFilas }] = campus.length
    ? await Promise.all([
        supabase
          .from('dream_team_turnos')
          .select('id, nombre, hora, orden')
          .in('campus_id', campus)
          .eq('activo', true)
          .eq('dia_semana', 0)
          // Dated Dream Team shifts (The Living Room) never reach Niños (S5, 20261026140000).
          .eq('tipo', 'semanal')
          .order('orden'),
        supabase.from('campus').select('id, nombre').in('id', campus).order('nombre'),
      ])
    : [{ data: [] as TurnoFila[] }, { data: [] as { id: string; nombre: string }[] }]

  const listaTurnos = (turnos ?? []) as TurnoFila[]
  const servicio = resolverServicio({ turno: query.turno, fecha: query.fecha }, listaTurnos, hoyEnCaracas())

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
