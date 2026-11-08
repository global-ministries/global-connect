/**
 * Niños — /ninos/eventos (RSC), odd/tasks/ninos-checkin-pco.md T1c (S5, S8).
 *
 * The check-in events of a campus, their horarios and check-in window. Read
 * by whoever may configure some Niños area (ninos_puede_configurar_algun_area:
 * Directora de Niños, area coordinators, admin and pastor); everyone else gets
 * a 404. The campuses offered are those with active salones where the caller
 * configures some area (ninos_puede_configurar_algun_area_campus, the gate of
 * ninos_eventos_admin). Writing needs ninos_puede_configurar_campus (every
 * area of the campus): without it the screen is read-only; every RPC checks
 * again. Query: ?campus= (default: the first by name), ?evento=.
 * The ninos_eventos RPCs are not in database.types.ts yet: they go through
 * lib/platform/ninos/eventos.ts with an untyped client.
 */
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

import { EventosClient } from '@/components/ninos/eventos/eventos-client'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { cargarEventosAdmin, consultarPermiso, type TurnoSemanal } from '@/lib/platform/ninos/eventos'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Eventos — Niños' }

type Props = {
  readonly searchParams: Promise<{ readonly campus?: string; readonly evento?: string }>
}

export default async function NinosEventosPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient()
  const { data: puede } = await supabase.rpc('ninos_puede_configurar_algun_area')
  if (puede !== true) notFound()

  const cliente = supabase as unknown as SupabaseClient
  const [query, { data: salones }] = await Promise.all([
    searchParams,
    supabase.from('ninos_salones').select('campus_id').eq('activo', true),
  ])
  const ids = [...new Set((salones ?? []).map((s) => s.campus_id))]
  const permitidos = (
    await Promise.all(ids.map(async (id) => ((await consultarPermiso(cliente, 'ninos_puede_configurar_algun_area_campus', id)) ? id : null)))
  ).filter((id): id is string => id !== null)
  const { data: campusFilas } = permitidos.length
    ? await supabase.from('campus').select('id, nombre').in('id', permitidos).order('nombre')
    : { data: [] as { id: string; nombre: string }[] }
  const campus = (campusFilas ?? []).map((c) => ({ id: c.id, nombre: c.nombre }))
  const actual = campus.find((c) => c.id === query.campus) ?? campus[0] ?? null
  const hoy = hoyEnCaracas()

  if (!actual) {
    return <EventosClient campus={[]} campusId={null} eventos={[]} errorLectura={null} puedeEditar={false} turnos={[]} hoy={hoy} />
  }

  const [eventos, puedeEditar, { data: turnos }] = await Promise.all([
    cargarEventosAdmin(cliente, actual.id),
    consultarPermiso(cliente, 'ninos_puede_configurar_campus', actual.id),
    supabase
      .from('dream_team_turnos')
      .select('id, nombre, hora, dia_semana')
      .eq('campus_id', actual.id)
      .eq('activo', true)
      .eq('tipo', 'semanal')
      .order('orden'),
  ])

  return (
    <EventosClient
      campus={campus}
      campusId={actual.id}
      eventos={eventos.ok ? eventos.data : []}
      errorLectura={eventos.ok ? null : eventos.message}
      puedeEditar={puedeEditar}
      turnos={(turnos ?? []) as TurnoSemanal[]}
      hoy={hoy}
      eventoInicial={query.evento}
    />
  )
}
