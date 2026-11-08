/**
 * DPS planning — what the caller may open, for the navigation
 * (odd/tasks/dps-asistencia-pco.md, T9). dps_puede_ver (planners, DPS
 * coordinators and directors, active DPS servidores) and dps_puede_planificar
 * (admin/pastor, the DPS direction and the added planners), both in
 * supabase/migrations/20261108200000_dps_planificacion_base.sql. Resolved
 * once per request by the (auth) layout, in parallel; fails closed.
 *
 * No server-only import: it takes the client, so the facts type is safe on
 * the client too.
 */
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
