/**
 * Niños — /ninos/voluntarios (RSC), odd/tasks/ninos-asistencia-voluntarios.md V3.
 *
 * Volunteer attendance for whoever may mark someone
 * (ninos_puede_marcar_voluntarios_algun_area: team and area coordinators,
 * Atención al Voluntario, the Directora de Niños, admin and pastor). Everyone
 * else gets a 404. The services come from ninos_voluntarios_turnos (a team
 * coordinator cannot read ninos_salones); the roster and every mark go through
 * the definer RPCs, which check authority per servicio.
 * Query: ?turno=&fecha=&area= (default: the first service, its last date).
 */
import { notFound } from 'next/navigation'

import { VoluntariosClient } from '@/components/ninos/voluntarios-client'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { leerTurnosVoluntarios, resolverServicioVoluntarios } from '@/lib/platform/ninos/voluntarios'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Voluntarios — Niños' }

type Props = {
  readonly searchParams: Promise<{ readonly turno?: string; readonly fecha?: string; readonly area?: string }>
}

export default async function NinosVoluntariosPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient()
  const { data: puede } = await supabase.rpc('ninos_puede_marcar_voluntarios_algun_area')
  if (puede !== true) notFound()

  const [query, { data: turnos }] = await Promise.all([searchParams, supabase.rpc('ninos_voluntarios_turnos')])
  const hoy = hoyEnCaracas()
  const lista = leerTurnosVoluntarios(turnos)
  const servicio = resolverServicioVoluntarios({ turno: query.turno, fecha: query.fecha }, lista, hoy)

  return (
    <ContenedorDashboard titulo="Voluntarios">
      <VoluntariosClient turnos={lista} servicio={servicio} areaId={query.area ?? null} hoy={hoy} />
    </ContenedorDashboard>
  )
}
