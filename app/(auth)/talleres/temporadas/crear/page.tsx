/**
 * T8 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/temporadas/
 * crear, replacing app/(auth)/admin/talleres/temporadas/crear/page.tsx
 * (kept alive, unmodified, until T10 deletes it).
 *
 * "crear", not "nueva" — parent decision, 2026-09-20: 4 of the app's 6
 * creation routes already use "crear", and the same object in Grupos de
 * Vida is already grupos-vida/temporadas/crear (see rutas.ts's
 * rutaTemporadaCrear header for the full reasoning).
 *
 * Thin server wrapper that enforces the write gate and renders the
 * client-side season form. PERMISSIONS: same flat capability check as the
 * list page and actions.ts (director.write OR admin.manage) — see
 * ../actions.ts's header for why this mirrors talleres_temporadas' own
 * UNSCOPED RLS predicate instead of a `cargarPermisos(client, equipoId)`
 * node lookup.
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
import { rutaTemporadas } from '@/lib/platform/talleres/rutas'

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
    findPersonaByAuthId: (authId) => findPlatformSessionPersonaByAuthId(supabase, authId),
    capabilitySupabase: supabase,
  })
  if (!session) {
    return (
      <ContenedorDashboard titulo="Crear Temporada">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">No se pudo resolver tu sesión.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  const caps = session.capabilities.map((c) => c.key)
  const puedeCrear =
    caps.includes('talleres_crecimiento.director.write') ||
    caps.includes('talleres_crecimiento.admin.manage')
  if (!puedeCrear) {
    return (
      <ContenedorDashboard
        titulo="Crear Temporada"
        botonRegreso={{ href: rutaTemporadas(), texto: 'Temporadas' }}
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
      botonRegreso={{ href: rutaTemporadas(), texto: 'Temporadas' }}
    >
      <TallerTemporadaForm />
    </ContenedorDashboard>
  )
}
