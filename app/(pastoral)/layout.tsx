/**
 * W13 — Layout for pastoral routes.
 *
 * Mirrors app/(auth)/layout.tsx structure with pastoral-specific context.
 *
 * Pastoral routes are nested under (auth) for auth context, but use
 * the pastoral dashboard pattern with pastoral header/breadcrumbs.
 *
 * This is a Server Component (not "use client") specifically so it can
 * resolve the current-user snapshot server-side — see
 * lib/auth/currentUserSnapshot.ts — the same way app/(auth)/layout.tsx does.
 * Nothing in this file used a hook or browser API, so dropping "use client"
 * has no effect on the children below: CampusProvider, BrandingProvider,
 * CurrentUserProvider, HeaderMovil, DashboardLayout and MenuInferiorMovil
 * are all still Client Components rendered from a Server Component parent,
 * exactly like app/(auth)/layout.tsx already does.
 */

import React from 'react'
import { HeaderMovil } from '@/components/ui/header-movil'
import { MenuInferiorMovil } from '@/components/ui/menu-inferior-movil'
import { CampusProvider } from '@/hooks/useCampus'
import { BrandingProvider } from '@/hooks/useBranding'
import { CurrentUserProvider } from '@/hooks/useCurrentUser'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { resolveCurrentUserSnapshot } from '@/lib/auth/currentUserSnapshot'

interface PastoralLayoutProps {
  children: React.ReactNode
}

export default async function PastoralLayout({ children }: PastoralLayoutProps) {
  // Server-resolved so the sidebar's role-gated items (Usuarios, Soporte,
  // Dream Team, ...) render on the first paint instead of waiting on
  // CurrentUserProvider's client-side fetch chain.
  const initialCurrentUser = await resolveCurrentUserSnapshot()

  return (
    <CampusProvider>
      <BrandingProvider branding={{ logoLightUrl: null, logoDarkUrl: null, faviconUrl: null }}>
        {/* resolveCurrentUserSnapshot returns null when it could not resolve
            (not the same as signed out — see its doc comment); falling back
            to `undefined` here reproduces the pre-snapshot behaviour:
            loading starts true and the client fetch runs as a normal load. */}
        <CurrentUserProvider initial={initialCurrentUser ?? undefined}>
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
