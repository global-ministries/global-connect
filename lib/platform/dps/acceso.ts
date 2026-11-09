/**
 * DPS planning — what the caller may open, for the "DPS" menu section
 * (odd/tasks/dps-asistencia-pco.md, T9; components/dps/dps-menu-item.ts). dps_puede_ver (planners, DPS
 * coordinators and directors, active DPS servidores) and dps_puede_planificar
 * (admin/pastor, the DPS direction and the added planners), both in
 * supabase/migrations/20261108200000_dps_planificacion_base.sql. Resolved
 * once per request by the (auth) layout, in parallel; fails closed.
 *
 * No server-only import: it takes the client, so the facts type is safe on
 * the client too.
 */
import type { PlatformSession } from '@/lib/platform/session/types'

import { rpcDps } from './rpc'

export interface DpsAcceso {
  readonly ver: boolean
  readonly planificar: boolean
}

export const SIN_ACCESO_DPS: DpsAcceso = { ver: false, planificar: false }

async function verdadero(pedido: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<boolean> {
  try {
    const { data, error } = await pedido()
    return !error && data === true
  } catch {
    return false
  }
}

export async function resolverDpsAcceso(cliente: { rpc?: unknown } | null, enabled: boolean): Promise<DpsAcceso> {
  if (!enabled || !cliente) return SIN_ACCESO_DPS
  const rpc = rpcDps(cliente)
  const [ver, planificar] = await Promise.all([verdadero(() => rpc('dps_puede_ver')), verdadero(() => rpc('dps_puede_planificar'))])
  // Planning implies seeing (dps_puede_ver checks it first).
  return { ver: ver || planificar, planificar }
}

/**
 * Whether the menu links the DPS attendance: a planner (who passes it in every
 * team), or someone who sees DPS and coordinates or directs some team. That
 * team may not be a DPS one or may not pass attendance; the page then says
 * there is nothing to mark (dps_asistencia_planilla decides per team).
 */
export function puedeAbrirAsistenciaDps(session: PlatformSession | null | undefined, acceso: DpsAcceso): boolean {
  if (!session) return false
  return (
    acceso.planificar ||
    (acceso.ver && session.capabilities.some((c) => c.key === 'dream_team.coordinate' || c.key === 'dream_team.direct'))
  )
}

/**
 * Where /dps opens (T10): the plan for planners (they arm it), the attendance
 * for whoever passes it, else the plan, which anyone who sees DPS may read
 * (and which decides who sees it).
 */
export function rutaInicioDps(session: PlatformSession | null | undefined, acceso: DpsAcceso): '/dps/plan' | '/dps/asistencia' {
  if (acceso.planificar) return '/dps/plan'
  return puedeAbrirAsistenciaDps(session, acceso) ? '/dps/asistencia' : '/dps/plan'
}
