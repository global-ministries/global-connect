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
 * Desk rules (odd/tasks/ninos-checkin-pco.md, T2d): the salones come with
 * their rules (capacidad, cupo_visitantes, abierto, corte / promoción) and
 * each turno with its Niños horario (event name and window, readable by who
 * operates Niños in the campus). Those columns and tables are not in
 * database.types.ts yet, so these two reads use an untyped client.
 * Labels (T3b, S10): the campuses of the salones go to the desk, which reads
 * its print stations itself (ninos_impresion_estaciones, as the user).
 */
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

import { CheckinClient } from '@/components/ninos/checkin-client'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { resolverServicio } from '@/lib/platform/ninos/checkin'
import { nombreCampus } from '@/lib/platform/ninos/checkin-vista'
import type { SalonFila } from '@/lib/platform/ninos/familias-vista'
import { parseHorarios } from '@/lib/platform/ninos/mesa-reglas'
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
  const sinTipos = supabase as unknown as SupabaseClient
  const { data: filasSalones } = await sinTipos
    .from('ninos_salones')
    .select(
      'id, nombre, area, edad_min_meses, edad_max_meses, grado_min, grado_max, es_necesidades_especiales, activo, orden, campus_id, capacidad, cupo_visitantes, abierto, corte_mes, corte_dia, promocion_mes, promocion_dia',
    )
    .eq('activo', true)
    .order('orden')
  const salones = (filasSalones ?? []) as (SalonFila & { campus_id: string })[]

  const campus = [...new Set(salones.map((s) => s.campus_id))]
  const hoy = hoyEnCaracas()
  const [{ turnos: listaTurnos, fecha }, { data: campusFilas }] = await Promise.all([
    cargarTurnosDelServicio(supabase, campus, query.fecha, hoy),
    campus.length
      ? supabase.from('campus').select('id, nombre').in('id', campus).order('nombre')
      : { data: [] as { id: string; nombre: string }[] },
  ])
  const servicio = resolverServicio({ turno: query.turno, fecha }, listaTurnos, hoy)
  const { data: filasHorarios } = listaTurnos.length
    ? await sinTipos
        .from('ninos_evento_horarios')
        .select('turno_id, abre_min_antes, cierra_min_despues, evento:ninos_eventos!inner(nombre, activo)')
        .in(
          'turno_id',
          listaTurnos.map((t) => t.id),
        )
        .eq('activo', true)
        .eq('evento.activo', true)
    : { data: [] }

  return (
    <CheckinClient
      salones={salones}
      turnos={listaTurnos}
      servicio={servicio}
      campus={nombreCampus((campusFilas ?? []).map((c) => c.nombre))}
      consultaInicial={query.q}
      padreInicial={query.padre}
      horarios={parseHorarios(filasHorarios)}
      campusIds={campus}
    />
  )
}
