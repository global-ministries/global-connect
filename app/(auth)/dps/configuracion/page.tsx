/**
 * DPS — /dps/configuracion (RSC), who builds the plan, who passes
 * attendance and the default horarios (T9 of odd/tasks/dps-asistencia-pco.md;
 * S6.2, S6.3).
 *
 * For whoever plans (dps_config_leer requires dps_puede_planificar); everyone
 * else gets the app's not-found state. The writes are for configurators only
 * (admin/pastor or the DPS direction, L17) and only the database knows who
 * they are, so the island (components/dps/configuracion-client.tsx)
 * turns read-only on the first 'sin_autoridad'. The four lists by position
 * (dps_lista_leer, S12.2) come with whether the caller edits each one.
 */
import { notFound, redirect } from 'next/navigation'

import { ConfiguracionClient } from '@/components/dps/configuracion-client'
import { leerConfig } from '@/lib/platform/dps/configuracion'
import { codigoErrorDps } from '@/lib/platform/dps/errores'
import { cargarListasDps } from '@/lib/platform/dps/listas'
import { rpcDps } from '@/lib/platform/dps/rpc'
import { isDreamTeamEnabled } from '@/lib/platform/dream-team/route-access'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Configuración — DPS' }

export default async function DpsConfiguracionPage() {
  if (!isDreamTeamEnabled()) notFound()

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const rpc = rpcDps(supabase)
  const [{ data, error }, listas] = await Promise.all([rpc('dps_config_leer', undefined), cargarListasDps(rpc)])
  if (error && codigoErrorDps(error) === 'sin_autoridad') notFound()

  return error ? (
    <ConfiguracionClient config={null} listas={listas} error="No se pudo cargar la configuración. Actualiza la página." />
  ) : (
    <ConfiguracionClient config={leerConfig(data)} listas={listas} error={null} />
  )
}
