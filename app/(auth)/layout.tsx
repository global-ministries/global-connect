import React from "react"
import { HeaderMovil } from "@/components/ui/header-movil"
import { MenuInferiorMovil } from "@/components/ui/menu-inferior-movil"
import { CampusProvider } from "@/hooks/useCampus"
import { BrandingProvider } from "@/hooks/useBranding"
import { CurrentUserProvider } from "@/hooks/useCurrentUser"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { createSupabaseServerClient } from "@/lib/supabase/server"

interface PropiedadesLayoutTablero {
  children: React.ReactNode
}

export default async function LayoutTablero({ children }: PropiedadesLayoutTablero) {
  // Obtener datos de branding para pasar a sidebar/header
  let branding = { logoLightUrl: null as string | null, logoDarkUrl: null as string | null, faviconUrl: null as string | null }
  try {
    const supabase = await createSupabaseServerClient()
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

  return (
    <CampusProvider>
      <BrandingProvider branding={branding}>
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