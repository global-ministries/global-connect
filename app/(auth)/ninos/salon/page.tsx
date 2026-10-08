/**
 * Niños — /ninos/salon (RSC), odd/tasks/ninos-checkin.md N5.
 *
 * Live list of one room for a service, with the alerts. Visible to whoever may
 * see some room (ninos_puede_ver_algun_salon: operators plus Líderes); the
 * room picker only lists rooms RLS lets the caller see (ninos_puede_ver_salon).
 * Check-out is shown only to ninos_puede_operar_algun_area(); the RPC still
 * checks each room. Everyone else gets a 404. Query: ?turno=&fecha=&salon=.
 */
import { notFound } from 'next/navigation'

import { SalonClient } from '@/components/ninos/salon-client'
import { resolverServicio, type TurnoFila } from '@/lib/platform/ninos/checkin'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Salones — Niños' }

type Props = {
  readonly searchParams: Promise<{ readonly turno?: string; readonly fecha?: string; readonly salon?: string }>
}

export default async function NinosSalonPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient()
  const [{ data: puedeVer }, { data: puedeOperar }] = await Promise.all([
    supabase.rpc('ninos_puede_ver_algun_salon'),
    supabase.rpc('ninos_puede_operar_algun_area'),
  ])
  if (!puedeVer) notFound()

  const query = await searchParams
  const { data: salones } = await supabase
    .from('ninos_salones')
    .select('id, nombre, orden, campus_id')
    .eq('activo', true)
    .order('orden')

  const lista = salones ?? []
  const campus = [...new Set(lista.map((s) => s.campus_id))]
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
  const servicio = resolverServicio({ turno: query.turno, fecha: query.fecha }, listaTurnos, hoyEnCaracas())
  const salonId = lista.find((s) => s.id === query.salon)?.id ?? lista[0]?.id ?? null

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-4 md:px-6 md:py-6 lg:max-w-7xl">
      <SalonClient
        salones={lista.map((s) => ({ id: s.id, nombre: s.nombre }))}
        turnos={listaTurnos}
        servicio={servicio}
        salonId={salonId}
        puedeOperar={Boolean(puedeOperar)}
      />
    </main>
  )
}
