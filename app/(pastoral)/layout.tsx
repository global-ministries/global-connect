"use client"

/**
 * W13 — Layout for pastoral routes.
 *
 * Mirrors app/(auth)/layout.tsx structure with pastoral-specific context.
 *
 * Pastoral routes are nested under (auth) for auth context, but use
 * the pastoral dashboard pattern with pastoral header/breadcrumbs.
 */

import React from 'react'
import { HeaderMovil } from '@/components/ui/header-movil'
import { MenuInferiorMovil } from '@/components/ui/menu-inferior-movil'
import { CampusProvider } from '@/hooks/useCampus'
import { BrandingProvider } from '@/hooks/useBranding'
import { CurrentUserProvider } from '@/hooks/useCurrentUser'
import { DashboardLayout } from '@/components/layout/dashboard-layout'

interface PastoralLayoutProps {
  children: React.ReactNode
}

export default function PastoralLayout({ children }: PastoralLayoutProps) {
  return (
    <CampusProvider>
      <BrandingProvider branding={{ logoLightUrl: null, logoDarkUrl: null, faviconUrl: null }}>
        <CurrentUserProvider>
          <div className="min-h-screen bg-[var(--surface-primary)]">
            <HeaderMovil />
            <div className="pt-16 pb-20 md:pt-0 md:pb-0">
              <DashboardLayout>{children}</DashboardLayout>
            </div>
            <MenuInferiorMovil />
          </div>
        </CurrentUserProvider>
      </BrandingProvider>
    </CampusProvider>
  )
}
