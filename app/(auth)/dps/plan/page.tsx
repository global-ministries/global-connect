/**
 * DPS — /dps/plan (RSC), Plan del domingo · Equipos and Orden
 * (T10 and T13 of odd/tasks/dps-asistencia-pco.md; S6.2, S6.4, S6.5, S7.1,
 * S7.4, S10; artboards docs/design-system/prototipos/planificacion-dps/01-plan-domingo-equipos.html
 * and 02-plan-domingo-orden.html).
 *
 * For whoever sees DPS (dps_planes_rango / dps_plan_leer require
 * dps_puede_ver); everyone else gets the app's not-found state. Without
 * `?plan=` it opens the next plan from today (today's included), else the
 * most recent one of the last year; `?plan=<id>` opens that plan. The date
 * pill steps to the plans before and after it (dps_planes_rango around its
 * date). Its teams come from dps_plan_equipos, which also says whether the
 * caller edits (puede_editar); its order of the service from dps_orden_leer
 * (T13), and `?vista=orden` opens on the «Orden» tab. The client island
 * (components/dps/plan-client.tsx) convoca, quita, copies and changes the
 * cover through lib/actions/dps-plan.actions.ts, and edits the order and
 * the horarios through lib/actions/dps-orden.actions.ts; the RPCs decide.
 */
import { notFound, redirect } from 'next/navigation'

import { PlanClient, type PlanClientProps } from '@/components/dps/plan-client'
import { codigoErrorDps, mensajeErrorDps } from '@/lib/platform/dps/errores'
import { leerOrden } from '@/lib/platform/dps/orden'
import { elegirProximoPlan, leerEquiposPlan, leerPlanCabecera, leerPlanesCabecera, urlPortada, vecinosPlan, type EquiposPlan, type PlanCabecera } from '@/lib/platform/dps/plan'
import { rpcDps } from '@/lib/platform/dps/rpc'
import { isDreamTeamEnabled } from '@/lib/platform/dream-team/route-access'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Plan — DPS' }

/** How far the default plan is looked for (dps_planes_rango allows 400 days). */
const DIAS_BUSQUEDA = 365
/** The window around the plan where the date pill finds its neighbours. */
const DIAS_VECINOS = 120
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

const primero = (valor: string | string[] | undefined): string | null => (Array.isArray(valor) ? valor[0] : valor) ?? null

export interface DpsPlanPageProps {
  readonly searchParams?: Promise<{ plan?: string | string[]; vista?: string | string[] }>
}

export default async function DpsPlanPage({ searchParams }: DpsPlanPageProps = {}) {
  if (!isDreamTeamEnabled()) notFound()

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const rpc = rpcDps(supabase)
  const hoy = hoyEnCaracas()
  const parametros = await searchParams
  const pedido = primero(parametros?.plan)
  const vista = primero(parametros?.vista) === 'orden' ? 'orden' : 'equipos'

  const vacio: PlanClientProps = { plan: null, anterior: null, siguiente: null, equipos: null, portadaUrl: null, motivo: null, error: null }
  let plan: PlanCabecera | null = null

  if (pedido !== null) {
    if (!UUID_RE.test(pedido)) return <PlanClient {...vacio} motivo="plan_invalido" />
    const leido = await rpc('dps_plan_leer', { p_plan_id: pedido })
    if (leido.error && codigoErrorDps(leido.error) === 'sin_autoridad') notFound()
    plan = leido.error ? null : leerPlanCabecera(leido.data)
    if (!plan) {
      const motivo = !leido.error || codigoErrorDps(leido.error) === 'plan_invalido' ? 'plan_invalido' : null
      return <PlanClient {...vacio} motivo={motivo} error={motivo ? null : mensajeErrorDps(leido.error, 'plan')} />
    }
  } else {
    const proximos = await rpc('dps_planes_rango', { p_desde: hoy, p_hasta: sumarDias(hoy, DIAS_BUSQUEDA) })
    if (proximos.error) {
      if (codigoErrorDps(proximos.error) === 'sin_autoridad') notFound()
      return <PlanClient {...vacio} error={mensajeErrorDps(proximos.error, 'plan')} />
    }
    plan = elegirProximoPlan(leerPlanesCabecera(proximos.data), hoy)
    if (!plan) {
      const pasados = await rpc('dps_planes_rango', { p_desde: sumarDias(hoy, -DIAS_BUSQUEDA), p_hasta: sumarDias(hoy, -1) })
      plan = pasados.error ? null : elegirProximoPlan(leerPlanesCabecera(pasados.data), hoy)
    }
    if (!plan) return <PlanClient {...vacio} motivo="sin_planes" />
  }

  const [alrededor, respuestaEquipos, respuestaOrden] = await Promise.all([
    rpc('dps_planes_rango', { p_desde: sumarDias(plan.fecha, -DIAS_VECINOS), p_hasta: sumarDias(plan.fecha, DIAS_VECINOS) }),
    rpc('dps_plan_equipos', { p_plan_id: plan.id }),
    rpc('dps_orden_leer', { p_plan_id: plan.id }),
  ])
  const { anterior, siguiente } = alrededor.error ? { anterior: null, siguiente: null } : vecinosPlan(leerPlanesCabecera(alrededor.data), plan.id)
  const equipos: EquiposPlan | null = respuestaEquipos.error ? null : leerEquiposPlan(respuestaEquipos.data)

  // Another plan starts a fresh island (teams, changes in flight, popovers).
  return (
    <PlanClient
      key={plan.id}
      plan={plan}
      anterior={anterior}
      siguiente={siguiente}
      equipos={equipos}
      portadaUrl={urlPortada(plan.serie?.imagenPath, process.env.NEXT_PUBLIC_SUPABASE_URL)}
      motivo={null}
      error={respuestaEquipos.error ? mensajeErrorDps(respuestaEquipos.error, 'plan') : null}
      orden={respuestaOrden.error ? null : leerOrden(respuestaOrden.data)}
      ordenError={respuestaOrden.error ? mensajeErrorDps(respuestaOrden.error, 'plan') : null}
      vista={vista}
    />
  )
}
