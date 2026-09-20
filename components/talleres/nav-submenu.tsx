"use client"

/**
 * PR20 — Talleres nav sub-menu component (sidebar wire).
 *
 * Renders the role-grouped sub-items inside the existing
 * `talleres_participation` top-level entry of the sidebar. The sidebar
 * already has the parent entry rendered (PR17 added the capability
 * filtering); this component supplies the children rendering + counter
 * badges.
 *
 * The sidebar passes sessionCapabilities (already resolved via
 * useCurrentUser). The component filters sub-items via
 * getTalleresNavItems + groupTalleresNavItems (PR17). Counters are
 * resolved locally via getTalleresCounterForClient (lightweight
 * client-side count using the existing supabase client — falls back
 * to the prop-supplied counters map when the client is unavailable).
 *
 * Counter badges: only displayed when count > 0 (avoid noise on empty
 * lists). Counter color matches the role group (P=info, L=info,
 * C=warning for pendientes, D=info).
 */

import { useEffect, useMemo, useState, type ReactElement } from 'react'
import Link from 'next/link'

import { BadgeSistema } from '@/components/ui/sistema-diseno'
import { usePathname } from 'next/navigation'

import {
  getTalleresNavItems,
  type TalleresNavItem,
} from '@/lib/platform/talleres/route-access'
import {
  groupTalleresNavItems,
  type TalleresNavGroup,
} from '@/lib/platform/talleres/navigation'
import { getTalleresFlags } from '@/lib/platform/talleres/flags'
import { createClient as createSupabaseBrowserClient } from '@/lib/supabase/client'

interface Input {
  readonly sessionCapabilities: readonly string[]
  readonly counters?: Readonly<Record<string, number>>
}

function flattenGroups(groups: readonly TalleresNavGroup[]): readonly TalleresNavItem[] {
  return groups.flatMap((g) => g.items)
}

export function counterVariantFor(itemId: string): 'info' | 'warning' {
  if (
    // T6 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/pendientes
    // is the merged pendientes inbox; "needs attention" convention.
    itemId === 'talleres_pendientes'
  ) {
    return 'warning'
  }
  return 'info'
}

/**
 * Fetches the live counter map for the sub-menu. Only runs when
 * sessionCapabilities grant at least one counter. Errors silently
 * leave counters empty (graceful degradation).
 *
 * T10 (odd/tasks/talleres-consolidar-pantallas.md) — this used to also
 * compute the OLD Dirección (talleres/reportes counts) and líder (mis
 * grupos) counters; both items are deleted (their pages redirect to the
 * /talleres catalog now, which is not a TalleresNavSubmenu item and has
 * no badge slot), so those 2 queries and the persona lookup they needed
 * are gone too — only talleres_pendientes survives.
 */
function useTalleresCounters(
  sessionCapabilities: readonly string[]
): Readonly<Record<string, number>> {
  const [counters, setCounters] = useState<Readonly<Record<string, number>>>({})

  useEffect(() => {
    const has =
      sessionCapabilities.includes('talleres_crecimiento.coordinator.read') ||
      sessionCapabilities.includes('talleres_crecimiento.director.read') ||
      sessionCapabilities.includes('talleres_crecimiento.metrics.read')
    if (!has) return

    let cancelled = false
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- browser client
        const client: any = supabase

        const [insc, solic] = await Promise.all([
          client
            .from('taller_inscripciones')
            .select('id', { count: 'exact', head: true })
            .eq('estado', 'pendiente'),
          client
            .from('taller_solicitudes_retiro')
            .select('id', { count: 'exact', head: true })
            .eq('estado', 'pendiente'),
        ])
        // /talleres/pendientes' badge must agree with the page's own two
        // sections, so it's derived from the SAME two counts the page
        // itself queries, not a 3rd one.
        const next: Record<string, number> = {
          talleres_pendientes: (insc.count ?? 0) + (solic.count ?? 0),
        }

        if (!cancelled) setCounters(next)
      } catch (error) {
        // T0 — surface the failure in development instead of swallowing it
        // silently (this is exactly how the talleres_crecimiento_metadata
        // rename went unnoticed: the badge just showed 0). The UI still
        // degrades gracefully — counters stay empty, nothing throws.
        if (process.env.NODE_ENV !== 'production') {
          console.error('[TalleresNavSubmenu] failed to load counters', error)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [sessionCapabilities])

  return counters
}

export function TalleresNavSubmenu({ sessionCapabilities, counters: propCounters }: Input): ReactElement | null {
  const pathname = usePathname()
  const fetchedCounters = useTalleresCounters(sessionCapabilities)
  const counters = propCounters ?? fetchedCounters

  const items = useMemo(() => {
    // PR42 — fix inconsistent sidebar vs. page access.
    //
    // The previous logic (PR26) computed `isTalleresEnabled()` and
    // filtered out every non-admin item when the flag was off — but
    // the corresponding pages (e.g. /talleres/explorar,
    // /talleres/mis-talleres) DON'T gate on the flag: they only gate
    // on `participation.read`. The result was a sidebar that hid
    // links to pages the user could reach, while the page itself
    // rendered normally if the user navigated by URL.
    //
    // The right policy: the sidebar reflects what the user CAN see
    // (capability-based), not a UX rollout decision. The flag stays
    // in charge of the page gate (each RSC checks `isTalleresEnabled`
    // and 404s if off). The sidebar stays purely capability-driven.
    //
    // T10 (odd/tasks/talleres-consolidar-pantallas.md) — the PR26
    // admin-only killSwitch fallback (an admin.manage-keyed item that
    // bypassed the kill switch) is gone: the one item that ever needed
    // it, `/admin/talleres/abstracto`, is deleted. Every surviving page
    // gates on `isTalleresEnabled()`, directly or via
    // `requireParticipante()` (participante.ts) — which already folds
    // in `killSwitch` — so when the kill switch is ON every page 404s
    // and the menu should show nothing at all, with no exception.
    const flags = getTalleresFlags()
    if (flags.killSwitch) return []
    return getTalleresNavItems(sessionCapabilities, { isEnabled: true })
  }, [sessionCapabilities])

  const groups = useMemo(() => groupTalleresNavItems(items), [items])
  const flat = useMemo(() => flattenGroups(groups), [groups])

  if (flat.length === 0) return null

  return (
    <ul className="ml-4 pl-3 mt-1 mb-1 space-y-0.5 border-l border-border/50">
      {flat.map((item) => {
        const count = counters[item.id] ?? 0
        const isActive =
          pathname === item.href || (pathname?.startsWith(item.href + '/') ?? false)
        return (
          <li key={item.id}>
            <Link
              href={item.href}
              prefetch={false}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                isActive
                  ? 'bg-[var(--brand-accent)] text-[var(--brand-primary)] font-medium'
                  : 'text-muted-foreground hover:bg-[var(--brand-accent)] hover:text-foreground'
              }`}
            >
              <span className="flex-1 truncate">{item.label}</span>
              {count > 0 && (
                <BadgeSistema variante={counterVariantFor(item.id)} tamaño="sm">
                  {count}
                </BadgeSistema>
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
