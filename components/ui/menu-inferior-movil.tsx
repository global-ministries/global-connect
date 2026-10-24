"use client"

import { type ComponentType } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { getPlatformNavigationFlags } from '@/lib/platform/flags'
import { usePlatformNavigationViewItems, type PlatformNavigationViewItem } from '@/components/ui/platform-navigation-view-items'
import { resolvePlatformNavigationGate } from '@/lib/platform/navigation'
import { useCredencialesNavegacion } from '@/components/navegacion/use-entradas-navegacion'
import { entradasBarraInferior, esRutaActiva, type EntradaNavegacion } from '@/lib/navegacion/registro'

type MenuInferiorMovilItem = {
  nombre: string
  icono: ComponentType<{ className?: string }>
  enlace: string
  id: string
}

export function MenuInferiorMovil() {
  const pathname = usePathname()
  const { platformSession, loading } = useCurrentUser()
  const platformNavigationItems = usePlatformNavigationViewItems(platformSession)
  // The bottom bar's own entries come from the navigation registry
  // (lib/navegacion/registro.ts) and follow the same role rule as the sidebar.
  const credenciales = useCredencialesNavegacion()
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
      : toMenuInferiorMovilItems(entradasBarraInferior(credenciales))

  return (
    <nav aria-label="Navegación inferior" className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/60 dark:bg-[rgba(35,35,45,0.60)] backdrop-blur-[40px] [-webkit-backdrop-filter:blur(40px)] backdrop-saturate-[1.8] border-t border-[var(--glass-border)] shadow-[var(--glass-shadow)] [transform:translateZ(0)] touch-manipulation">
      {/* Height: 8px + a 56px item + the bottom inset (at least 8px); the (auth) layout pads the page by it. */}
      <ul className="flex min-w-0 items-stretch justify-around gap-1 px-2 pt-2 safe-area-pb safe-area-pl safe-area-pr">
        {navigationItems.map((elemento) => {
          const Icono = elemento.icono
          const esActivo = esRutaActiva(pathname, elemento.enlace)

          return (
            <li key={elemento.id} className="flex min-w-0 flex-1">
              <Link
                href={elemento.enlace}
                prefetch={false}
                aria-label={`Navegar a ${elemento.nombre}`}
                aria-current={esActivo ? "page" : undefined}
                className={cn(
                  "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5",
                  "transition-[background-color,color,transform] duration-200 ease-expo",
                  "press-scale focus-ring touch-manipulation",
                  esActivo
                    ? "bg-brand-tint text-brand-text"
                    : "text-muted-foreground hover:bg-[var(--brand-accent)] hover:text-foreground"
                )}
              >
                <Icono aria-hidden="true" className={cn("size-5 shrink-0", esActivo ? "text-brand" : "text-muted-foreground")} />
                <span className={cn("max-w-full truncate text-xs", esActivo ? "font-semibold" : "font-medium")}>
                  {elemento.nombre}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function toMenuInferiorMovilItems(items: ReadonlyArray<PlatformNavigationViewItem | EntradaNavegacion>): MenuInferiorMovilItem[] {
  return items.map((item) => ({
    nombre: item.label,
    icono: item.icon,
    enlace: item.href,
    id: item.id,
  }))
}
