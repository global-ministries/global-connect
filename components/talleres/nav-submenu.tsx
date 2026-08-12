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
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
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
    itemId === 'talleres_coordinacion_inscripciones_pendientes' ||
    itemId === 'talleres_direccion_solicitudes'
  ) {
    return 'warning'
  }
  return 'info'
}

/**
 * Fetches the live counter map for the sub-menu. Only runs when
 * sessionCapabilities grant at least one counter. Errors silently
 * leave counters empty (graceful degradation).
 */
function useTalleresCounters(
  sessionCapabilities: readonly string[]
): Readonly<Record<string, number>> {
  const [counters, setCounters] = useState<Readonly<Record<string, number>>>({})

  useEffect(() => {
    const has =
      sessionCapabilities.includes('talleres_crecimiento.coordinator.read') ||
      sessionCapabilities.includes('talleres_crecimiento.director.read') ||
      sessionCapabilities.includes('talleres_crecimiento.metrics.read') ||
      sessionCapabilities.includes('talleres_crecimiento.lead.read') ||
      sessionCapabilities.includes('talleres_crecimiento.volunteer.read')
    if (!has) return

    let cancelled = false
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- browser client
        const client: any = supabase
        const next: Record<string, number> = {}

        if (
          sessionCapabilities.includes('talleres_crecimiento.coordinator.read') ||
          sessionCapabilities.includes('talleres_crecimiento.director.read') ||
          sessionCapabilities.includes('talleres_crecimiento.metrics.read')
        ) {
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
          next['talleres_coordinacion_inscripciones_pendientes'] = insc.count ?? 0
          next['talleres_direccion_solicitudes'] = solic.count ?? 0
        }
        if (
          sessionCapabilities.includes('talleres_crecimiento.director.read') ||
          sessionCapabilities.includes('talleres_crecimiento.metrics.read')
        ) {
          const [talleres, certs] = await Promise.all([
            client
              .from('talleres_crecimiento_metadata')
              .select('id', { count: 'exact', head: true })
              .in('estado', ['abierto', 'en_curso']),
            client
              .from('taller_certificados')
              .select('id', { count: 'exact', head: true })
              .is('revocado_at', null),
          ])
          next['talleres_direccion_talleres'] = talleres.count ?? 0
          next['talleres_direccion_reportes'] = certs.count ?? 0
        }

        // L role — count my grupos where I'm the leader.
        // (The 'talleres_sesiones_proximas' counter is a placeholder for
        // MVP — a full impl would join taller_sesiones through
        // taller_grupo_asignaciones.)
        if (
          sessionCapabilities.includes('talleres_crecimiento.lead.read') ||
          sessionCapabilities.includes('talleres_crecimiento.volunteer.read')
        ) {
          // For the L counter we need the persona_id. In the browser
          // context the user is signed in but the supabase auth.getUser()
          // is async. We pull it from the existing client.
          const { data: userData } = await client.auth.getUser()
          const personaId = userData?.user?.id
          if (personaId) {
            const grupos = await client
              .from('taller_grupo_asignaciones')
              .select('id', { count: 'exact', head: true })
              .eq('persona_id', personaId)
              .eq('activo', true)
              .eq('rol', 'lider')
            next['talleres_grupos_mis_grupos'] = grupos.count ?? 0
            next['talleres_sesiones_proximas'] = 0
          }
        }

        if (!cancelled) setCounters(next)
      } catch {
        // Silent failure — submenu renders without counters.
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
    if (!isTalleresEnabled()) return []
    return getTalleresNavItems(sessionCapabilities)
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
