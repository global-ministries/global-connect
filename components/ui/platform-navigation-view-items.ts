"use client"

import { useEffect, useState, type ComponentType, type Dispatch, type SetStateAction } from 'react'
import { AlertTriangle, BarChart3, Calendar, ClipboardList, MapPin, Megaphone, Settings, User, UserCheck, UserCog, Users } from 'lucide-react'

import { getPlatformNavigationFlags, type PlatformNavigationFlags } from '@/lib/platform/flags'
import { resolvePlatformNavigation, resolvePlatformNavigationGate } from '@/lib/platform/navigation'
import type {
  PlatformNavigationItem,
  PlatformNavigationItemId,
  PlatformNavigationSession,
} from '@/lib/platform/navigation'

export type PlatformNavigationViewItem = {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  href: string
  children?: never
  roles?: never
  capabilities?: never
  badge?: never
  badgeVariant?: never
  className?: never
}

const PLATFORM_NAVIGATION_ICONS: Partial<Record<PlatformNavigationItemId, ComponentType<{ className?: string }>>> = {
  grupos_vida_stage: UserCheck,
  dps_team_service: Megaphone,
  ninos_room_context: Users,
  estudiantes_room_context: Users,
  talleres_participation: ClipboardList,
  dps_admin: Settings,
  nextgen_admin: Settings,
  uno_a_uno_global: User,
  pastor_dashboard: BarChart3,
  pastor_usuarios: UserCog,
  pastor_crisis: AlertTriangle,
  pastor_lecturas: ClipboardList,
  lider_dashboard: User,
  lider_uno_a_uno: Calendar,
  asistido_roadmap: MapPin,
} satisfies Partial<Record<PlatformNavigationItemId, ComponentType<{ className?: string }>>>

export async function resolvePlatformNavigationViewItems(
  platformSession: PlatformNavigationSession | null | undefined,
  flags: PlatformNavigationFlags = getPlatformNavigationFlags()
): Promise<PlatformNavigationViewItem[]> {
  const gate = resolvePlatformNavigationGate({ flags, platformSession })
  if (!gate.ok) return []

  const resolution = await resolvePlatformNavigation({
    flags,
    platformSession: gate.platformSession,
  })

  return resolution.mode === 'platform'
    ? dedupePlatformNavigationItemsByBaseId(
        resolution.visibleItems.filter((item) => item.id !== 'lider_triada'),
      )
      .map(toPlatformNavigationViewItem)
      .filter((item): item is PlatformNavigationViewItem => item !== null)
    : []
}

export function usePlatformNavigationViewItems(
  platformSession: PlatformNavigationSession | null | undefined
): PlatformNavigationViewItem[] {
  const [items, setItems] = useState<PlatformNavigationViewItem[]>([])

  useEffect(() => {
    const flags = getPlatformNavigationFlags()
    const gate = resolvePlatformNavigationGate({ flags, platformSession })
    if (!gate.ok) {
      clearPlatformNavigationViewItems(setItems)
      return
    }

    let isCurrent = true

    resolvePlatformNavigationViewItems(gate.platformSession, flags)
      .then((resolvedItems) => {
        if (isCurrent) setItems(resolvedItems)
      })
      .catch(() => {
        if (isCurrent) setItems([])
      })

    return () => {
      isCurrent = false
    }
  }, [platformSession])

  return items
}

function clearPlatformNavigationViewItems(setItems: Dispatch<SetStateAction<PlatformNavigationViewItem[]>>) {
  setItems((current) => (current.length > 0 ? [] : current))
}

function toPlatformNavigationViewItem(item: PlatformNavigationItem): PlatformNavigationViewItem | null {
  const icon = PLATFORM_NAVIGATION_ICONS[item.id]
  if (!icon) return null

  return {
    id: `platform-${item.id}-${item.scope.type}-${item.scope.id ?? 'global'}`,
    label: item.label,
    icon,
    href: item.href,
  }
}

/**
 * PR H — collapses navigation items sharing the same base `item.id` into
 * a single entry. The platform capability resolver emits one visibleItem
 * per matching capability SCOPE, so a user holding the same capability at
 * multiple scopes (e.g. `talleres_crecimiento.participation.read` for two
 * different talleres) would otherwise produce duplicate top-level entries
 * (two "Talleres" links). We keep one entry per base id, preferring a
 * global-scoped grant over a narrowly-scoped one, else the first seen.
 */
function dedupePlatformNavigationItemsByBaseId(
  items: readonly PlatformNavigationItem[],
): PlatformNavigationItem[] {
  const byId = new Map<PlatformNavigationItemId, PlatformNavigationItem>()
  for (const item of items) {
    const existing = byId.get(item.id)
    if (!existing) {
      byId.set(item.id, item)
      continue
    }
    // Prefer a global-scoped entry when the same base id appears at both
    // a narrow scope and the global scope.
    if (!isGlobalScope(existing) && isGlobalScope(item)) {
      byId.set(item.id, item)
    }
  }
  return [...byId.values()]
}

function isGlobalScope(item: PlatformNavigationItem): boolean {
  return item.scope.id === undefined || item.scope.id === 'global'
}
