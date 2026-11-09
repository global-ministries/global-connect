/**
 * Niños — /ninos/familias (RSC), odd/tasks/ninos-checkin.md N3.
 *
 * Find or register a family at the check-in table. Open to whoever
 * ninos_puede_operar_algun_area() allows (Anfitriones, area coordinators,
 * Directora de Niños, admin, pastor); everyone else gets a 404. Every write
 * goes through SECURITY DEFINER RPCs that re-check that authority.
 *
 * The «Custodia» section of a ficha (T2e of odd/tasks/ninos-checkin-pco.md,
 * S9.2) is shown only to coordinación / dirección of Niños
 * (ninos_puede_configurar_algun_area); ninos_custodia_lista / _guardar check
 * it again per child.
 *
 * ?nueva=1&volver=checkin&turno=&fecha= opens the registration and returns to
 * the check-in with the new family selected (N4).
 */
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
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
  // The salón rule columns are newer than the generated types, as in the desk page.
  const sinTipos = supabase as unknown as SupabaseClient
  const [{ data: salones }, { data: puedeCustodia }] = await Promise.all([
    sinTipos
      .from('ninos_salones')
      .select(
        'id, nombre, area, edad_min_meses, edad_max_meses, grado_min, grado_max, es_necesidades_especiales, activo, orden, abierto, corte_mes, corte_dia, promocion_mes, promocion_dia',
      )
      .eq('activo', true)
      .order('orden'),
    supabase.rpc('ninos_puede_configurar_algun_area'),
  ])

  const volverCheckin =
    query.volver === 'checkin'
      ? `/ninos/checkin?turno=${encodeURIComponent(query.turno ?? '')}&fecha=${encodeURIComponent(query.fecha ?? '')}`
      : undefined

  return (
    <ContenedorDashboard titulo="Familias">
      <FamiliasClient
        salones={(salones ?? []) as SalonFila[]}
        fechaServicio={fechaServicioCaracas()}
        registrarAlInicio={query.nueva === '1'}
        volverCheckin={volverCheckin}
        puedeEditarCustodia={puedeCustodia === true}
      />
    </ContenedorDashboard>
  )
}
