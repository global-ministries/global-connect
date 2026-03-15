"use client"

import React from 'react'
import { SidebarModerna, useSidebarModerna } from '@/components/ui/sidebar-moderna'
import { cn } from '@/lib/utils'

interface DashboardLayoutProps {
  children: React.ReactNode
  className?: string
}

export function DashboardLayout({ children, className }: DashboardLayoutProps) {
  const { isCollapsed } = useSidebarModerna()

  return (
    <div className="flex h-screen bg-[var(--surface-primary)]">
      {/* Sidebar */}
      <SidebarModerna />

      {/* Contenido principal */}
      <main
        className={cn(
          "flex-1 overflow-auto transition-[margin] duration-300 ease-in-out scrollbar-glass",
          "md:ml-0",
          className
        )}
      >
        {children}
      </main>
    </div>
  )
}
