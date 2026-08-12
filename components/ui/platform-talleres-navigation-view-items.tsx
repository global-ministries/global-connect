"use client"

/**
 * PR17 — DT-069 — Additive extension to platform-navigation-view-items.
 *
 * This file is a SIBLING to `platform-navigation-view-items.ts` (NOT a
 * modification of it). It exposes a hook `useTalleresNavViewItems`
 * that returns the role-grouped talleres sub-items ready for the
 * renderer. The existing `sidebar-moderna.tsx` and `header-movil.tsx`
 * are NOT modified — only the new `MenuItem` definition is added via
 * this file. Future PR18/PR19 may wire the renderer; for now this
 * file provides the data + types only.
 *
 * The hook is **purely data**: it does not render UI. The renderer is
 * expected to consume `TalleresNavViewGroup[]` and produce the actual
 * menu entries.
 *
 * Implementation: the hook computes synchronously during render using
 * `useMemo`. The underlying helpers are pure and have no async/IO
 * side-effects, so no `useEffect` is needed.
 */

import { useMemo } from 'react'

import { getTalleresNavItems, type TalleresNavItem } from '@/lib/platform/talleres/route-access'
import {
  groupTalleresNavItems,
  type TalleresNavGroup,
} from '@/lib/platform/talleres/navigation'

export type TalleresNavViewGroup = TalleresNavGroup
export type TalleresNavViewItem = TalleresNavItem

interface Input {
  /** Capabilities the current session holds. Empty array → empty menu. */
  readonly sessionCapabilities: readonly string[]
  /**
   * Optional override for the feature flag. When omitted the hook reads
   * `isTalleresEnabled()` lazily. Tests pass `false` directly.
   */
  readonly isEnabled?: boolean
}

/**
 * React hook returning the talleres sub-item groups ready for the UI.
 * Always returns an empty array while the feature flag is off (kill
 * switch), regardless of the user's capabilities. Pure computation
 * memoized on the inputs.
 */
export function useTalleresNavViewItems(input: Input): readonly TalleresNavViewGroup[] {
  const { sessionCapabilities, isEnabled } = input
  return useMemo(() => {
    if (isEnabled === false) return []
    const items = getTalleresNavItems(sessionCapabilities, { isEnabled })
    return groupTalleresNavItems(items)
  }, [sessionCapabilities, isEnabled])
}

/**
 * Imperative variant for SSR / RSC consumers that do not have a React
 * hook context. Returns the same grouped shape.
 */
export function resolveTalleresNavViewItems(input: Input): readonly TalleresNavViewGroup[] {
  if (input.isEnabled === false) return []
  const items = getTalleresNavItems(input.sessionCapabilities, { isEnabled: input.isEnabled })
  return groupTalleresNavItems(items)
}
