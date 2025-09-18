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
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <SidebarModerna />
      
      {/* Contenido principal */}
      <main 
        className={cn(
          "flex-1 overflow-auto transition-all duration-300 ease-in-out",
          "md:ml-0", // En móvil no hay margen porque el sidebar es overlay
          className
        )}
      >
        {children}
      </main>
    </div>
  )
}
