"use client"

import { type ComponentType } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, UsersRound, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { getPlatformNavigationFlags } from '@/lib/platform/flags'
import { usePlatformNavigationViewItems, type PlatformNavigationViewItem } from '@/components/ui/platform-navigation-view-items'
import { resolvePlatformNavigationGate } from '@/lib/platform/navigation'

type MenuInferiorMovilItem = {
  nombre: string
  icono: ComponentType<{ className?: string }>
  enlace: string
  id: string
}

const elementosMenu: MenuInferiorMovilItem[] = [
  { nombre: "Dashboard", icono: LayoutDashboard, enlace: "/dashboard", id: "dashboard" },
  { nombre: "Usuarios", icono: Users, enlace: "/users", id: "users" },
  { nombre: "Grupos de Vida", icono: UsersRound, enlace: "/grupos-vida", id: "grupos-vida" },
  { nombre: "Ayuda", icono: HelpCircle, enlace: "/ayuda", id: "ayuda" },
]

export function MenuInferiorMovil() {
  const pathname = usePathname()
  const { platformSession, loading } = useCurrentUser()
  const platformNavigationItems = usePlatformNavigationViewItems(platformSession)
  const platformNavigationFlags = getPlatformNavigationFlags()
  const platformNavigationGate = resolvePlatformNavigationGate({
    flags: platformNavigationFlags,
    platformSession,
  })
  // #224 navigation states: legacy links while loading/flag-off/kill-switch; resolved platform
  // items once available; fail-closed empty when a scoped platform session exists but has no
  // visible routes, so we never fall back to global legacy links in that case.
  const hasPlatformNavigationItems = platformNavigationItems.length > 0
  const hasPlatformCapabilities = (platformSession?.capabilities.length ?? 0) > 0
  const showPlatformItems = hasPlatformNavigationItems && (loading || platformNavigationGate.ok)
  const suppressLegacyForFailClosed = !loading && platformNavigationGate.ok && !hasPlatformNavigationItems && hasPlatformCapabilities

  const navigationItems = suppressLegacyForFailClosed
    ? []
    : showPlatformItems
      ? toMenuInferiorMovilItems(platformNavigationItems)
      : elementosMenu

  return (
    <nav aria-label="Navegación inferior" className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/60 dark:bg-[rgba(35,35,45,0.60)] backdrop-blur-[40px] [-webkit-backdrop-filter:blur(40px)] backdrop-saturate-[1.8] border-t border-[var(--glass-border)] shadow-[var(--glass-shadow)] [transform:translateZ(0)] touch-manipulation">
      <div className="flex items-center justify-around px-2 py-2 safe-area-pb">
        {navigationItems.map((elemento) => {
          const Icono = elemento.icono

          const esActivo = pathname === elemento.enlace ||
            (elemento.enlace !== "/dashboard" && pathname?.startsWith(elemento.enlace))

          return (
            <Link
              key={elemento.id}
              href={elemento.enlace}
              prefetch={false}
              aria-label={`Navegar a ${elemento.nombre}`}
              aria-current={esActivo ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center px-3 py-2 rounded-xl min-w-0 flex-1 min-h-[44px]",
                "transition-[background-color,color,transform] duration-200 ease-expo",
                "press-scale focus-ring",
                esActivo
                  ? "bg-[var(--brand-accent)] text-[var(--brand-primary)]"
                  : "text-muted-foreground hover:text-[var(--brand-primary)] hover:bg-[var(--brand-accent)]"
              )}
            >
              <Icono className={cn("w-5 h-5 mb-1", esActivo ? "text-[var(--brand-primary)]" : "text-muted-foreground")} />
              <span className={cn(
                "text-xs font-medium truncate max-w-full",
                esActivo ? "text-[var(--brand-primary)]" : "text-muted-foreground"
              )}>
                {elemento.nombre}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function toMenuInferiorMovilItems(items: PlatformNavigationViewItem[]): MenuInferiorMovilItem[] {
  return items.map((item) => ({
    nombre: item.label,
    icono: item.icon,
    enlace: item.href,
    id: item.id,
  }))
}
