import React from "react"
import { HeaderMovil } from "@/components/ui/header-movil"
import { MenuInferiorMovil } from "@/components/ui/menu-inferior-movil"
import { CampusProvider } from "@/hooks/useCampus"
import { BrandingProvider } from "@/hooks/useBranding"
import { CurrentUserProvider } from "@/hooks/useCurrentUser"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { resolveCurrentUserSnapshot } from "@/lib/auth/currentUserSnapshot"

interface PropiedadesLayoutTablero {
  children: React.ReactNode
}

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>

async function resolveBranding(supabase: SupabaseServerClient) {
  // Obtener datos de branding para pasar a sidebar/header
  let branding = { logoLightUrl: null as string | null, logoDarkUrl: null as string | null, faviconUrl: null as string | null }
  try {
    const { data } = await supabase
      .from("configuracion_plataforma")
      .select("logo_light_url, logo_dark_url, favicon_url")
      .limit(1)
      .single()
    if (data) {
      branding = {
        logoLightUrl: data.logo_light_url,
        logoDarkUrl: data.logo_dark_url,
        faviconUrl: data.favicon_url,
      }
    }
  } catch {
    // Usar defaults
  }
  return branding
}

export default async function LayoutTablero({ children }: PropiedadesLayoutTablero) {
  const supabase = await createSupabaseServerClient()
  // Branding and the current-user snapshot (see lib/auth/currentUserSnapshot.ts)
  // are independent server reads that both used to happen — one here, one on
  // the client — so resolve them together instead of one after another. The
  // snapshot reuses this same client instead of creating a second one; see
  // resolveCurrentUserSnapshot's doc comment.
  const [branding, initialCurrentUser] = await Promise.all([
    resolveBranding(supabase),
    resolveCurrentUserSnapshot(supabase),
  ])

  return (
    <CampusProvider>
      <BrandingProvider branding={branding}>
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