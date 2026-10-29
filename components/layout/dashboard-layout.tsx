"use client"

import React from 'react'
import { SidebarModerna } from '@/components/ui/sidebar-moderna'
import { cn } from '@/lib/utils'

interface DashboardLayoutProps {
  children: React.ReactNode
  className?: string
}

/** Id of the page's main landmark, the target of the "Saltar al contenido" link. */
export const ID_CONTENIDO_PRINCIPAL = 'contenido-principal'

export function DashboardLayout({ children, className }: DashboardLayoutProps) {
  return (
    <div className="flex h-screen bg-[var(--surface-primary)]">
      {/* Skip link: the first stop of the keyboard, visible only on focus. */}
      <a
        href={`#${ID_CONTENIDO_PRINCIPAL}`}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-xl focus:bg-card focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-foreground focus:shadow-sheet focus-ring"
      >
        Saltar al contenido
      </a>

      {/* Sidebar */}
      <SidebarModerna />

      {/* Contenido principal: the page's only scroll container. */}
      <main
        id={ID_CONTENIDO_PRINCIPAL}
        tabIndex={-1}
        className={cn(
          "flex-1 min-w-0 overflow-auto outline-none",
          className
        )}
      >
        {children}
      </main>
    </div>
  )
}
