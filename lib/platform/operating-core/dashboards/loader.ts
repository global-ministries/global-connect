/**
 * S21 — Dashboard data loader for Operating Core.
 *
 * Pure function: takes session + view, returns dashboard data.
 * Capability-gated via `operating_core.dashboards.read`.
 * Returns STUB data with `flags.isFallback = true` for now;
 * future slices populate real data.
 *
 * Distinct from lib/dashboard/obtenerDatosDashboard.ts (Fase 2 — untouched).
 */
import type { PlatformSession } from '@/lib/platform/session/types'
import { hasOperatingCoreDashboardsReadCapability } from '../route-access'
import { getDirectorWidgetsStub } from '@/app/operating-core/dashboards/widgets/director-widgets'
import { getLiderWidgetsStub } from '@/app/operating-core/dashboards/widgets/lider-widgets'
import { getOperadorWidgetsStub } from '@/app/operating-core/dashboards/widgets/operador-widgets'
import type { DashboardData, DashboardView } from './dashboard-types'

export type LoadDashboardResult =
  | { ok: true; data: DashboardData }
  | { ok: false; error: 'no_capability' | 'unknown_view' | 'no_session' }

/**
 * Load dashboard data for a given view.
 *
 * @param input.view - One of: 'director' | 'lider' | 'operador'
 * @param input.session - Platform session (null if unauthenticated)
 * @param input.nowIso - ISO timestamp used as generatedAt
 */
export async function loadDashboardData(input: {
  view: DashboardView
  session: PlatformSession | null
  nowIso: string
}): Promise<LoadDashboardResult> {
  // 1. No session → unauthenticated
  if (input.session === null) {
    return { ok: false, error: 'no_session' }
  }

  // 2. Capability check — NO role-string checks
  if (!hasOperatingCoreDashboardsReadCapability(input.session)) {
    return { ok: false, error: 'no_capability' }
  }

  // 3. Dispatch by view — all return stub data for now
  switch (input.view) {
    case 'director':
      return {
        ok: true,
        data: {
          view: 'director',
          widgets: getDirectorWidgetsStub(),
          generatedAt: input.nowIso,
          flags: { isFallback: true },
        },
      }

    case 'lider':
      return {
        ok: true,
        data: {
          view: 'lider',
          widgets: getLiderWidgetsStub(),
          generatedAt: input.nowIso,
          flags: { isFallback: true },
        },
      }

    case 'operador':
      return {
        ok: true,
        data: {
          view: 'operador',
          widgets: getOperadorWidgetsStub(),
          generatedAt: input.nowIso,
          flags: { isFallback: true },
        },
      }

    default: {
      // exhaustive check — TypeScript would catch invalid view at compile time
      return { ok: false, error: 'unknown_view' }
    }
  }
}
