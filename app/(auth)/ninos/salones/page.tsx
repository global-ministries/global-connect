/**
 * Niños — /ninos/salones (RSC), odd/tasks/ninos-checkin-pco.md T1d (S5, S8.3,
 * S8.4). Not /ninos/salon, which is the classroom roster.
 *
 * The rules of the salones of a campus and «Probar reglas». Read by whoever
 * may configure some Niños area (ninos_puede_configurar_algun_area: Directora
 * de Niños, area coordinators, admin and pastor; the gate of /ninos/eventos);
 * everyone else gets a 404. Campuses: those with active salones where the
 * caller configures some area (ninos_puede_configurar_algun_area_campus).
 * Each salón is editable when the caller passes ninos_puede_configurar on its
 * equipo (an area coordinator edits only their area); the RPC and the RLS
 * check again. Also read: the carpetas of the campus and the children inside
 * each salón today (for «Probar reglas»). Query: ?campus=, ?salon=.
 * The rule columns, ninos_carpetas and the RPCs are not in database.types.ts
 * yet: they go through an untyped client (lib/platform/ninos/salones-reglas.ts).
 */
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

import { SalonesClient } from '@/components/ninos/salones/salones-client'
import { consultarPermiso } from '@/lib/platform/ninos/eventos'
import { fechaServicioPorDefecto, hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { COLUMNAS_SALON, leerCarpetas, leerSalones } from '@/lib/platform/ninos/salones-reglas'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Salones de check-in — Niños' }

type Props = {
  readonly searchParams: Promise<{ readonly campus?: string; readonly salon?: string }>
}

export default async function NinosSalonesPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient()
  const { data: puede } = await supabase.rpc('ninos_puede_configurar_algun_area')
  if (puede !== true) notFound()

  const cliente = supabase as unknown as SupabaseClient
  const [query, { data: activos }] = await Promise.all([
    searchParams,
    supabase.from('ninos_salones').select('campus_id').eq('activo', true),
  ])
  const ids = [...new Set((activos ?? []).map((s) => s.campus_id))]
  const permitidos = (
    await Promise.all(ids.map(async (id) => ((await consultarPermiso(cliente, 'ninos_puede_configurar_algun_area_campus', id)) ? id : null)))
  ).filter((id): id is string => id !== null)
  const { data: campusFilas } = permitidos.length
    ? await supabase.from('campus').select('id, nombre').in('id', permitidos).order('nombre')
    : { data: [] as { id: string; nombre: string }[] }
  const campus = (campusFilas ?? []).map((c) => ({ id: c.id, nombre: c.nombre }))
  const actual = campus.find((c) => c.id === query.campus) ?? campus[0] ?? null
  const hoy = hoyEnCaracas()
  const fechaServicio = fechaServicioPorDefecto(hoy)

  if (!actual) {
    return (
      <SalonesClient
        campus={[]}
        campusId={null}
        salones={[]}
        carpetas={[]}
        equiposEditables={[]}
        ocupadosHoy={{}}
        fechaServicio={fechaServicio}
        errorLectura={null}
      />
    )
  }

  const [salonesR, carpetasR, adentroR] = await Promise.all([
    cliente.from('ninos_salones').select(COLUMNAS_SALON).eq('campus_id', actual.id).eq('activo', true).order('orden'),
    // ninos_carpetas.distribucion is no longer read (S9.5): the salones that fit fill in order.
    cliente.from('ninos_carpetas').select('area, mantener_regulares').eq('campus_id', actual.id),
    supabase.from('ninos_checkins').select('salon_id').eq('campus_id', actual.id).eq('fecha', hoy).is('salida_at', null),
  ])
  const salones = leerSalones(salonesR.data)
  const equipos = [...new Set(salones.map((s) => s.equipoId))]
  const equiposEditables = (
    await Promise.all(
      equipos.map(async (equipo) => {
        const { data } = await supabase.rpc('ninos_puede_configurar', { p_equipo_id: equipo })
        return data === true ? equipo : null
      }),
    )
  ).filter((e): e is string => e !== null)
  const ocupadosHoy: Record<string, number> = {}
  for (const c of adentroR.data ?? []) ocupadosHoy[c.salon_id] = (ocupadosHoy[c.salon_id] ?? 0) + 1

  return (
    <SalonesClient
      campus={campus}
      campusId={actual.id}
      salones={salones}
      carpetas={leerCarpetas(carpetasR.data)}
      equiposEditables={equiposEditables}
      ocupadosHoy={ocupadosHoy}
      fechaServicio={fechaServicio}
      errorLectura={salonesR.error ? 'No se pudieron leer los salones. Recarga la página.' : null}
      salonInicial={query.salon}
    />
  )
}
