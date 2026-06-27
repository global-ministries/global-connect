import { resolvePlatformNavigation } from '@/lib/platform/navigation'
import type {
  PlatformNavigationFlags,
  PlatformNavigationItem,
  PlatformNavigationResolution,
  PlatformNavigationResolverInput,
  PlatformNavigationSession,
} from '@/lib/platform/navigation'

export type DashboardContextualShortcut = {
  id: string
  label: string
  href: string
  description: string
}

type DashboardContextualAccessOptions = {
  resolveNavigation?: (input: PlatformNavigationResolverInput) => Promise<PlatformNavigationResolution>
}

const DASHBOARD_CONTEXTUAL_DESCRIPTION = 'Accede al espacio disponible para este contexto.'
const VERIFIED_DASHBOARD_CONTEXTUAL_ROUTES = new Set(['/grupos-vida'])

export function getDashboardPlatformNavigationFlags(): PlatformNavigationFlags {
  return {
    enabled: process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED === 'true',
    killSwitch: process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH === 'true',
  }
}

export async function resolveDashboardContextualAccess(
  platformSession: PlatformNavigationSession | null | undefined,
  flags: PlatformNavigationFlags = getDashboardPlatformNavigationFlags(),
  options: DashboardContextualAccessOptions = {}
): Promise<DashboardContextualShortcut[]> {
  try {
    const resolveNavigation = options.resolveNavigation ?? resolvePlatformNavigation
    const resolution = await resolveNavigation({ flags, platformSession })

    if (resolution.mode !== 'platform') return []

    return resolution.visibleItems
      .filter(isVerifiedDashboardContextualRoute)
      .map(toDashboardContextualShortcut)
  } catch {
    return []
  }
}

function isVerifiedDashboardContextualRoute(item: PlatformNavigationItem): boolean {
  return VERIFIED_DASHBOARD_CONTEXTUAL_ROUTES.has(item.href)
}

function toDashboardContextualShortcut(item: PlatformNavigationItem): DashboardContextualShortcut {
  return {
    id: ['dashboard-context', item.id, item.scope.type, item.scope.id ?? 'global'].join('-'),
    label: item.label,
    href: item.href,
    description: DASHBOARD_CONTEXTUAL_DESCRIPTION,
  }
}
