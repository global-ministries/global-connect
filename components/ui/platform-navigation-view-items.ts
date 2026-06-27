"use client"

import { useEffect, useState, type ComponentType } from 'react'
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

type PlatformNavigationViewItemsState = {
  sessionKey: string
  items: PlatformNavigationViewItem[]
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
  const sessionKey = getPlatformNavigationSessionKey(platformSession)
  const [state, setState] = useState<PlatformNavigationViewItemsState>({ sessionKey, items: [] })

  useEffect(() => {
    const flags = getBuildTimePlatformNavigationFlags()
    const gate = resolvePlatformNavigationGate({ flags, platformSession })
    if (!gate.ok) return

    let isCurrent = true

    resolvePlatformNavigationViewItems(gate.platformSession, flags)
      .then((resolvedItems) => {
        if (!isCurrent) return
        setState((current) => toPlatformNavigationViewItemsState(current, sessionKey, resolvedItems))
      })
      .catch(() => {
        if (!isCurrent) return
        setState((current) => toPlatformNavigationViewItemsState(current, sessionKey, []))
      })

    return () => {
      isCurrent = false
    }
  }, [platformSession, sessionKey])

  return state.sessionKey === sessionKey ? state.items : []
}

function toPlatformNavigationViewItemsState(
  current: PlatformNavigationViewItemsState,
  sessionKey: string,
  items: PlatformNavigationViewItem[]
): PlatformNavigationViewItemsState {
  if (current.sessionKey === sessionKey && arePlatformNavigationViewItemsEqual(current.items, items)) {
    return current
  }

  return { sessionKey, items }
}

function arePlatformNavigationViewItemsEqual(
  currentItems: PlatformNavigationViewItem[],
  nextItems: PlatformNavigationViewItem[]
): boolean {
  if (currentItems.length !== nextItems.length) return false
  return currentItems.every((currentItem, index) => {
    const nextItem = nextItems[index]
    return currentItem.id === nextItem.id &&
      currentItem.label === nextItem.label &&
      currentItem.href === nextItem.href &&
      currentItem.icon === nextItem.icon
  })
}

function getPlatformNavigationSessionKey(session: PlatformNavigationSession | null | undefined): string {
  if (!session) return 'platform-session:none'

  const contextsKey = session.contexts
    .map((context) => [context.experience, context.scopeType, context.scopeId ?? '', context.label].join(':'))
    .join('|')
  const capabilitiesKey = session.capabilities
    .map((capability) => [capability.key, capability.experience, capability.scopeType, capability.scopeId ?? '', capability.source].join(':'))
    .join('|')

  return [session.personaId, session.subjectAuthId, session.globalRoles.join(','), contextsKey, capabilitiesKey].join('::')
}

function toPlatformNavigationViewItem(item: PlatformNavigationItem): PlatformNavigationViewItem {
  return {
    id: `platform-${item.id}-${item.scope.type}-${item.scope.id ?? 'global'}`,
    label: item.label,
    icon: PLATFORM_NAVIGATION_ICONS[item.id],
    href: item.href,
  }
}
