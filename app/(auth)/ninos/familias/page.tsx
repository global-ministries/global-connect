/**
 * Niños — /ninos/familias (RSC), odd/tasks/ninos-checkin.md N3.
 *
 * Find or register a family at the check-in table. Open to whoever
 * ninos_puede_operar_algun_area() allows (Anfitriones, area coordinators,
 * Directora de Niños, admin, pastor); everyone else gets a 404. Every write
 * goes through SECURITY DEFINER RPCs that re-check that authority.
 */
import { notFound } from 'next/navigation'

import { FamiliasClient } from '@/components/ninos/familias-client'
import type { SalonFila } from '@/lib/platform/ninos/familias-vista'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Familias — Niños' }

/** Today when it is Sunday, otherwise the next Sunday (YYYY-MM-DD, UTC). */
function proximoDomingo(hoy = new Date()): string {
  const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()))
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7))
  return d.toISOString().slice(0, 10)
}

export default async function NinosFamiliasPage() {
  const supabase = await createSupabaseServerClient()
  const { data: puede } = await supabase.rpc('ninos_puede_operar_algun_area')
  if (!puede) notFound()

  const { data: salones } = await supabase
    .from('ninos_salones')
    .select('id, nombre, area, edad_min_meses, edad_max_meses, grado_min, grado_max, es_necesidades_especiales, activo, orden')
    .eq('activo', true)
    .order('orden')

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-4">
      <FamiliasClient salones={(salones ?? []) as SalonFila[]} fechaServicio={proximoDomingo()} />
    </main>
  )
}
