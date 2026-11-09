/**
 * DPS — /dps/asistencia (RSC), the Sunday attendance on the phone
 * (T9 of odd/tasks/dps-asistencia-pco.md; S6.1, S7.4, S2).
 *
 * For whoever sees DPS (dps_planes_rango requires dps_puede_ver); everyone
 * else gets the app's not-found state. The plans are those of the marking
 * window (today in Caracas and 14 days back); the screen opens today's plan,
 * else the most recent one, and `?plan=` picks another of the window. Its
 * sheet (dps_asistencia_planilla) lists only the teams where the caller
 * passes attendance (planners: all of DPS); without any, the island says so.
 * The client island (components/dps/asistencia-client.tsx) marks
 * through lib/actions/dps-asistencia.actions.ts; the RPCs decide who may mark
 * whom and the window.
 */
import { notFound, redirect } from 'next/navigation'

import { AsistenciaClient, type AsistenciaClientProps } from '@/components/dps/asistencia-client'
import { codigoErrorDps, mensajeErrorDps } from '@/lib/platform/dps/errores'
import { elegirPlan, leerPlanes, leerPlanilla, type PlanillaDps } from '@/lib/platform/dps/planilla'
import { rpcDps } from '@/lib/platform/dps/rpc'
import { isDreamTeamEnabled } from '@/lib/platform/dream-team/route-access'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Asistencia — DPS' }

/** The marking window of dps_asistencia_marcar: the plan's fecha up to 14 days back. */
const DIAS_VENTANA = 14

function restarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

const primero = (valor: string | string[] | undefined): string | null => (Array.isArray(valor) ? valor[0] : valor) ?? null

export interface DpsAsistenciaPageProps {
  readonly searchParams?: Promise<{ plan?: string | string[] }>
}

export default async function DpsAsistenciaPage({ searchParams }: DpsAsistenciaPageProps = {}) {
  if (!isDreamTeamEnabled()) notFound()

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const rpc = rpcDps(supabase)
  const hoy = hoyEnCaracas()
  const [parametros, rango] = await Promise.all([searchParams, rpc('dps_planes_rango', { p_desde: restarDias(hoy, DIAS_VENTANA), p_hasta: hoy })])
  if (rango.error && codigoErrorDps(rango.error) === 'sin_autoridad') notFound()

  const planes = rango.error ? [] : leerPlanes(rango.data).filter((p) => p.fecha <= hoy)
  const plan = elegirPlan(planes, hoy, primero(parametros?.plan))

  let planilla: PlanillaDps | null = null
  let error: AsistenciaClientProps['error'] = rango.error ? { mensaje: mensajeErrorDps(rango.error, 'planilla'), sinEquipos: false } : null
  if (plan) {
    const respuesta = await rpc('dps_asistencia_planilla', { p_plan_id: plan.id, p_equipo_id: null })
    if (respuesta.error) {
      error = { mensaje: mensajeErrorDps(respuesta.error, 'planilla'), sinEquipos: codigoErrorDps(respuesta.error) === 'sin_autoridad' }
    } else {
      planilla = leerPlanilla(respuesta.data)
    }
  }

  // Another plan starts a fresh island (sheet, marks in flight, filter).
  return <AsistenciaClient key={plan?.id ?? 'sin-plan'} planes={planes} plan={plan} planilla={planilla} error={error} />
}
