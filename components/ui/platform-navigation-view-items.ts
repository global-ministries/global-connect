"use client"

import { useEffect, useState, type ComponentType, type Dispatch, type SetStateAction } from 'react'
import { ClipboardList, Megaphone, Settings, User, UserCheck, Users } from 'lucide-react'

import { resolvePlatformNavigation, resolvePlatformNavigationGate } from '@/lib/platform/navigation'
import type {
  PlatformNavigationFlags,
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

const PLATFORM_NAVIGATION_ICONS = {
  grupos_vida_stage: UserCheck,
  dps_team_service: Megaphone,
  ninos_room_context: Users,
  estudiantes_room_context: Users,
  talleres_participation: ClipboardList,
  dps_admin: Settings,
  nextgen_admin: Settings,
  talleres_admin: Settings,
  uno_a_uno_global: User,
} satisfies Record<PlatformNavigationItemId, ComponentType<{ className?: string }>>

export function getBuildTimePlatformNavigationFlags(): PlatformNavigationFlags {
  return {
    enabled: process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED === 'true',
    killSwitch: process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH === 'true',
  }
}

export async function resolvePlatformNavigationViewItems(
  platformSession: PlatformNavigationSession | null | undefined,
  flags: PlatformNavigationFlags = getBuildTimePlatformNavigationFlags()
): Promise<PlatformNavigationViewItem[]> {
  const gate = resolvePlatformNavigationGate({ flags, platformSession })
  if (!gate.ok) return []

  const resolution = await resolvePlatformNavigation({
    flags,
    platformSession: gate.platformSession,
  })

  return resolution.mode === 'platform'
    ? resolution.visibleItems.map(toPlatformNavigationViewItem)
    : []
}

export function usePlatformNavigationViewItems(
  platformSession: PlatformNavigationSession | null | undefined
): PlatformNavigationViewItem[] {
  const [items, setItems] = useState<PlatformNavigationViewItem[]>([])

  useEffect(() => {
    const flags = getBuildTimePlatformNavigationFlags()
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

function toPlatformNavigationViewItem(item: PlatformNavigationItem): PlatformNavigationViewItem {
  return {
    id: `platform-${item.id}-${item.scope.type}-${item.scope.id ?? 'global'}`,
    label: item.label,
    icon: PLATFORM_NAVIGATION_ICONS[item.id],
    href: item.href,
  }
}
