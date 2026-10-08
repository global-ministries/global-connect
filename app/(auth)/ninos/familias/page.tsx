/**
 * Niños — /ninos/familias (RSC), odd/tasks/ninos-checkin.md N3.
 *
 * Find or register a family at the check-in table. Open to whoever
 * ninos_puede_operar_algun_area() allows (Anfitriones, area coordinators,
 * Directora de Niños, admin, pastor); everyone else gets a 404. Every write
 * goes through SECURITY DEFINER RPCs that re-check that authority.
 *
 * ?nueva=1&volver=checkin&turno=&fecha= opens the registration and returns to
 * the check-in with the new family selected (N4).
 */
import { notFound } from 'next/navigation'

import { FamiliasClient } from '@/components/ninos/familias-client'
import { fechaServicioCaracas } from '@/lib/platform/ninos/fecha'
import type { SalonFila } from '@/lib/platform/ninos/familias-vista'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Familias — Niños' }

type Props = {
  readonly searchParams: Promise<{ readonly nueva?: string; readonly volver?: string; readonly turno?: string; readonly fecha?: string }>
}

export default async function NinosFamiliasPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient()
  const { data: puede } = await supabase.rpc('ninos_puede_operar_algun_area')
  if (!puede) notFound()

  const query = await searchParams
  const { data: salones } = await supabase
    .from('ninos_salones')
    .select('id, nombre, area, edad_min_meses, edad_max_meses, grado_min, grado_max, es_necesidades_especiales, activo, orden')
    .eq('activo', true)
    .order('orden')

  const volverCheckin =
    query.volver === 'checkin'
      ? `/ninos/checkin?turno=${encodeURIComponent(query.turno ?? '')}&fecha=${encodeURIComponent(query.fecha ?? '')}`
      : undefined

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-4">
      <FamiliasClient
        salones={(salones ?? []) as SalonFila[]}
        fechaServicio={fechaServicioCaracas()}
        registrarAlInicio={query.nueva === '1'}
        volverCheckin={volverCheckin}
      />
    </main>
  )
}
