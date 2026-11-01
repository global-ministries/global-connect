/**
 * Estudiantes — /estudiantes/voluntarios (RSC), the volunteer attendance of
 * Transit, Inside Out and The Living Room (C5 of
 * odd/tasks/estudiantes-fase-b.md).
 *
 * For whoever may mark some Estudiantes volunteer
 * (estudiantes_puede_marcar_voluntarios: the coordinators of the node or
 * above, Atención al Voluntario, the pastor of the campus, the system admin);
 * everyone else gets the app's not-found state. The services come from
 * estudiantes_voluntarios_turnos (a dated The Living Room service only on its
 * planned dates); the roster loads here and the client island
 * (components/estudiantes/voluntarios/voluntarios-client.tsx) marks through
 * lib/actions/estudiantes-voluntarios.actions.ts. The RPCs check authority per
 * servicio and the campus rule.
 *
 * URL: `?turno&fecha` (the first service on its last date by default) and
 * `?ambito`.
 */
import { notFound, redirect } from 'next/navigation'

import { VoluntariosClient } from '@/components/estudiantes/voluntarios/voluntarios-client'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { leerPlanilla, mensajeErrorPlanilla, type Planilla } from '@/lib/platform/ninos/voluntarios'
import { leerTurnosVoluntariosEstudiantes, resolverServicioVoluntariosEstudiantes } from '@/lib/platform/estudiantes/voluntarios'
import { primerParametro, type ParametrosVivo } from '@/lib/platform/estudiantes/vivo-vista'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Voluntarios — Estudiantes' }

export interface EstudiantesVoluntariosPageProps {
  readonly searchParams?: Promise<ParametrosVivo>
}

export default async function EstudiantesVoluntariosPage({ searchParams }: EstudiantesVoluntariosPageProps = {}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: puede } = await supabase.rpc('estudiantes_puede_marcar_voluntarios')
  if (puede !== true) notFound()

  const [parametros, { data: filas }] = await Promise.all([searchParams, supabase.rpc('estudiantes_voluntarios_turnos')])
  const query = parametros ?? {}
  const hoy = hoyEnCaracas()
  const turnos = leerTurnosVoluntariosEstudiantes(filas)
  const servicio = resolverServicioVoluntariosEstudiantes({ turno: primerParametro(query.turno), fecha: primerParametro(query.fecha) }, turnos, hoy)

  let planilla: Planilla | null = null
  let error: string | null = null
  if (servicio.turnoId && servicio.fecha) {
    const respuesta = await supabase.rpc('estudiantes_voluntarios_planilla', { p_turno_id: servicio.turnoId, p_fecha: servicio.fecha })
    if (respuesta.error) error = mensajeErrorPlanilla(respuesta.error)
    else planilla = leerPlanilla(respuesta.data)
  }

  return (
    // Another service or date starts a fresh island (roster, marks in flight, filters).
    <VoluntariosClient
      key={`${servicio.turnoId}|${servicio.fecha}`}
      turnos={turnos}
      servicio={servicio}
      planilla={planilla}
      error={error}
      ambitoInicial={primerParametro(query.ambito) ?? null}
      hoy={hoy}
    />
  )
}
