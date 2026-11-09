/**
 * DPS — /dps/programacion (RSC), the annual programming sheet that replaces
 * the Excel "Series 2026" (T11 of odd/tasks/dps-asistencia-pco.md; S6.4,
 * S7.1, S7.3; artboard
 * docs/design-system/prototipos/planificacion-dps/04-programacion-anual-hoja.html).
 *
 * For whoever sees DPS (dps_planes_rango requires dps_puede_ver); everyone
 * else gets the app's not-found state. `?anio=` picks the year (else this
 * year in Caracas); its plans come from dps_planes_rango (1 Jan to 31 Dec)
 * and dps_puede_planificar says whether the caller edits (S6: plain
 * servidores read). The client island (components/dps/programacion-client.tsx)
 * edits the cells and creates series through
 * lib/actions/dps-programacion.actions.ts; the RPCs decide. The four lists
 * by position (dps_lista_leer, S12.3) feed the suggestions of the
 * Productor, Host, Comunicador and Cantantes cells.
 */
import { notFound, redirect } from 'next/navigation'

import { ProgramacionClient } from '@/components/dps/programacion-client'
import { codigoErrorDps } from '@/lib/platform/dps/errores'
import { cargarListasDps } from '@/lib/platform/dps/listas'
import { leerPlanesHoja } from '@/lib/platform/dps/programacion'
import { rpcDps } from '@/lib/platform/dps/rpc'
import { isDreamTeamEnabled } from '@/lib/platform/dream-team/route-access'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Programación — DPS' }

const ERROR_CARGA = 'No se pudo cargar la programación. Actualiza la página.'

const primero = (valor: string | string[] | undefined): string | null => (Array.isArray(valor) ? valor[0] : valor) ?? null

export interface DpsProgramacionPageProps {
  readonly searchParams?: Promise<{ anio?: string | string[] }>
}

export default async function DpsProgramacionPage({ searchParams }: DpsProgramacionPageProps = {}) {
  if (!isDreamTeamEnabled()) notFound()

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const rpc = rpcDps(supabase)
  const hoy = hoyEnCaracas()
  const pedido = primero((await searchParams)?.anio)
  const anio = pedido && /^\d{4}$/.test(pedido) && Number(pedido) >= 2000 && Number(pedido) <= 2100 ? Number(pedido) : Number(hoy.slice(0, 4))

  const [planes, planifica, listas] = await Promise.all([
    rpc('dps_planes_rango', { p_desde: `${anio}-01-01`, p_hasta: `${anio}-12-31` }),
    rpc('dps_puede_planificar', undefined),
    cargarListasDps(rpc),
  ])
  if (planes.error && codigoErrorDps(planes.error) === 'sin_autoridad') notFound()

  // Another year starts a fresh island (edits in flight, filters).
  return (
    <ProgramacionClient
      key={anio}
      anio={anio}
      hoy={hoy}
      planes={planes.error ? [] : leerPlanesHoja(planes.data)}
      editable={!planifica.error && planifica.data === true}
      listas={listas}
      error={planes.error ? ERROR_CARGA : null}
    />
  )
}
