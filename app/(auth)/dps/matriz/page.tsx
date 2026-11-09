/**
 * DPS — /dps/matriz (RSC), Matriz de domingos (T12 of
 * odd/tasks/dps-asistencia-pco.md; S6, S7, S8; artboard
 * docs/design-system/prototipos/planificacion-dps/03-matriz-domingos.html).
 *
 * For whoever sees DPS (dps_planes_rango / dps_plan_equipos require
 * dps_puede_ver); everyone else gets the app's not-found state. `?desde=`
 * picks the first Sunday (any date reads as the Sunday of its week; else the
 * Sunday of today, «Hoy»); the range is 8 Sundays up to the Saturday after
 * the last one, so ‹ › step 8 weeks without gaps. Its plans come from
 * dps_planes_rango and each plan's teams from dps_plan_equipos, composed
 * here instead of a new RPC: the first plan is read alone, so its sync of
 * the director puestos (dps_directores_puestos_sincronizar) runs once and
 * the rest, read in parallel, find them in sync; each read also syncs its
 * plan's automatic directors from today on (S8, L40). A plan whose teams
 * cannot be read is left out and the island says how many. The caller edits
 * when the database says so (puede_editar = dps_puede_planificar). The
 * client island (components/dps/matriz-client.tsx) convoca and quita through
 * lib/actions/dps-plan.actions.ts; the RPCs decide.
 */
import { notFound, redirect } from 'next/navigation'

import { MatrizClient } from '@/components/dps/matriz-client'
import { codigoErrorDps, mensajeErrorDps } from '@/lib/platform/dps/errores'
import { leerDesdeMatriz, rangoMatriz } from '@/lib/platform/dps/matriz'
import { leerEquiposPlan, leerPlanesCabecera, type EquiposPlan } from '@/lib/platform/dps/plan'
import { rpcDps, type RpcDps } from '@/lib/platform/dps/rpc'
import { isDreamTeamEnabled } from '@/lib/platform/dream-team/route-access'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Matriz — DPS' }

const primero = (valor: string | string[] | undefined): string | null => (Array.isArray(valor) ? valor[0] : valor) ?? null

async function leerEquipos(rpc: RpcDps, planId: string): Promise<EquiposPlan | null> {
  try {
    const { data, error } = await rpc('dps_plan_equipos', { p_plan_id: planId })
    return error ? null : leerEquiposPlan(data)
  } catch {
    return null
  }
}

export interface DpsMatrizPageProps {
  readonly searchParams?: Promise<{ desde?: string | string[] }>
}

export default async function DpsMatrizPage({ searchParams }: DpsMatrizPageProps = {}) {
  if (!isDreamTeamEnabled()) notFound()

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const rpc = rpcDps(supabase)
  const hoy = hoyEnCaracas()
  const rango = rangoMatriz(leerDesdeMatriz(primero((await searchParams)?.desde), hoy))

  const respuesta = await rpc('dps_planes_rango', { p_desde: rango.desde, p_hasta: rango.hasta })
  if (respuesta.error) {
    if (codigoErrorDps(respuesta.error) === 'sin_autoridad') notFound()
    return <MatrizClient key={rango.desde} rango={rango} hoy={hoy} planes={[]} equipos={{}} editable={false} error={mensajeErrorDps(respuesta.error, 'plan')} />
  }

  const planes = leerPlanesCabecera(respuesta.data)
  const [primerPlan, ...resto] = planes
  const leidos = primerPlan ? [await leerEquipos(rpc, primerPlan.id), ...(await Promise.all(resto.map((p) => leerEquipos(rpc, p.id))))] : []

  const equipos: Record<string, EquiposPlan> = {}
  planes.forEach((p, i) => {
    const e = leidos[i]
    if (e) equipos[p.id] = e
  })
  const fallidos = planes.length - Object.keys(equipos).length
  const error =
    fallidos === 0 ? null : fallidos === 1 ? 'No se pudo cargar 1 fecha. Actualiza la página.' : `No se pudieron cargar ${fallidos} fechas. Actualiza la página.`

  // Another range starts a fresh island (changes in flight, popover, highlight).
  return (
    <MatrizClient
      key={rango.desde}
      rango={rango}
      hoy={hoy}
      planes={planes}
      equipos={equipos}
      editable={Object.values(equipos).some((e) => e.puedeEditar)}
      error={error}
    />
  )
}
