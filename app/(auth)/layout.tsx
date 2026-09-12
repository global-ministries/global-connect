import React from "react"
import { HeaderMovil } from "@/components/ui/header-movil"
import { MenuInferiorMovil } from "@/components/ui/menu-inferior-movil"
import { CampusProvider } from "@/hooks/useCampus"
import { BrandingProvider } from "@/hooks/useBranding"
import { CurrentUserProvider } from "@/hooks/useCurrentUser"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { createSupabaseServerClient, createSupabaseServerClientOrNull } from "@/lib/supabase/server"
import { resolveCurrentUserSnapshot } from "@/lib/auth/currentUserSnapshot"

interface PropiedadesLayoutTablero {
  children: React.ReactNode
}

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>

const DEFAULT_BRANDING = { logoLightUrl: null as string | null, logoDarkUrl: null as string | null, faviconUrl: null as string | null }

async function resolveBranding(supabase: SupabaseServerClient) {
  // Obtener datos de branding para pasar a sidebar/header
  let branding = DEFAULT_BRANDING
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
  // This layout renders for every authenticated page, so building the
  // Supabase client must degrade instead of crashing the whole (auth) route
  // group if it ever throws (a missing cookies() context, a misconfigured
  // env) — createSupabaseServerClient() used to live inside resolveBranding's
  // own try/catch for exactly this reason. `null` here means default
  // branding and no `initial` snapshot: resolveCurrentUserSnapshot(undefined)
  // still tries to build its own client and, per its own contract, degrades
  // to `null` (not a throw) if that also fails — CurrentUserProvider then
  // falls back to its normal client-side load.
  const supabase = await createSupabaseServerClientOrNull()
  // Branding and the current-user snapshot (see lib/auth/currentUserSnapshot.ts)
  // are independent server reads that both used to happen — one here, one on
  // the client — so resolve them together instead of one after another. The
  // snapshot reuses this same client instead of creating a second one; see
  // resolveCurrentUserSnapshot's doc comment.
  const [branding, initialCurrentUser] = await Promise.all([
    supabase ? resolveBranding(supabase) : Promise.resolve(DEFAULT_BRANDING),
    resolveCurrentUserSnapshot(supabase ?? undefined),
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