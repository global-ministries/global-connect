/**
 * Niños — /ninos/checkin (RSC), odd/tasks/ninos-checkin.md N4.
 *
 * Sunday check-in at the table. Same gate as Familias:
 * ninos_puede_operar_algun_area() (Anfitriones, area coordinators, Directora
 * de Niños, admin, pastor); everyone else gets a 404. The service (turno and
 * date) lives in the query (?turno=&fecha=) so a reload keeps it; ?q=&padre=
 * selects a family just registered from here.
 */
import { notFound } from 'next/navigation'

import { CheckinClient } from '@/components/ninos/checkin-client'
import { hoyLocal, resolverServicio, type TurnoFila } from '@/lib/platform/ninos/checkin'
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
  const { data: turnos } = campus.length
    ? await supabase
        .from('dream_team_turnos')
        .select('id, nombre, hora, orden')
        .in('campus_id', campus)
        .eq('activo', true)
        .eq('dia_semana', 0)
        .order('orden')
    : { data: [] as TurnoFila[] }

  const listaTurnos = (turnos ?? []) as TurnoFila[]
  const servicio = resolverServicio({ turno: query.turno, fecha: query.fecha }, listaTurnos, hoyLocal())

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-4">
      <CheckinClient
        salones={(salones ?? []) as SalonFila[]}
        turnos={listaTurnos}
        servicio={servicio}
        consultaInicial={query.q}
        padreInicial={query.padre}
      />
    </main>
  )
}
