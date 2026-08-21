/**
 * PR C (Fase 5 GdV-parity) — /admin/talleres/temporadas/crear (RSC).
 *
 * Thin server wrapper that enforces the write gate (director.write OR
 * admin.manage) and renders the client-side season form. Mirrors the GdV
 * temporada-create page shape.
 */

import {
  ContenedorDashboard,
  TarjetaSistema,
  TextoSistema,
} from '@/components/ui/sistema-diseno'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'

import { TallerTemporadaForm } from './temporada-form'

export const metadata = { title: 'Crear Temporada' }

export default async function CrearTemporadaPage() {
  if (!isTalleresEnabled()) {
    return (
      <ContenedorDashboard titulo="Crear Temporada">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">El módulo de talleres está deshabilitado.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) {
    return (
      <ContenedorDashboard titulo="Crear Temporada">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">Necesitás iniciar sesión.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  const session = await resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) =>
      findPlatformSessionPersonaByAuthId(supabase, authId),
    capabilitySupabase: supabase,
  })
  const caps = session?.capabilities.map((c) => c.key) ?? []
  const canWrite =
    caps.includes('talleres_crecimiento.director.write') ||
    caps.includes('talleres_crecimiento.admin.manage')
  if (!canWrite) {
    return (
      <ContenedorDashboard
        titulo="Crear Temporada"
        botonRegreso={{ href: '/admin/talleres/temporadas', texto: 'Temporadas' }}
      >
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">No tenés permisos para crear temporadas.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  return (
    <ContenedorDashboard
      titulo="Crear Temporada"
      botonRegreso={{ href: '/admin/talleres/temporadas', texto: 'Temporadas' }}
    >
      <TallerTemporadaForm />
    </ContenedorDashboard>
  )
}
