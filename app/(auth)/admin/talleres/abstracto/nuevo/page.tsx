/**
 * PR23.1 — /admin/talleres/abstracto/nuevo.
 *
 * Direct page for creating a taller abstracto. The form is the
 * same client component used on the index page.
 *
 * T4c — gated exactly like its siblings (abstracto/page.tsx,
 * abstracto/[slug]/page.tsx): isTalleresEnabled(), then a signed-in
 * user, then a resolved platform session, then a
 * director.write/admin.manage capability check — each returning the
 * same informational card its siblings render for that case, before
 * the equipo-picker loader or the form ever run. Before this fix the
 * page had none of this: reachable with the flag off, and running a
 * live fetchOpcionesEquipoTaller query for any authenticated user
 * regardless of capability (a read-only talleres user could see the
 * admin node picker).
 */

import { ContenedorDashboard, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { fetchOpcionesEquipoTaller } from '@/lib/platform/talleres/equipo-organigrama'

import { CrearTallerAbstractoForm } from './crear-form'

export const metadata = { title: 'Crear Grupo de Corto Plazo' }

export default async function CrearTallerAbstractoPage() {
  if (!isTalleresEnabled()) {
    return (
      <ContenedorDashboard titulo="Crear Grupo de Corto Plazo">
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
      <ContenedorDashboard titulo="Crear Grupo de Corto Plazo">
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
  if (!session) {
    return (
      <ContenedorDashboard titulo="Crear Grupo de Corto Plazo">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">No se pudo resolver tu sesión.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  const caps = session.capabilities.map((c) => c.key)
  const hasCap =
    caps.includes('talleres_crecimiento.director.write') ||
    caps.includes('talleres_crecimiento.admin.manage')

  if (!hasCap) {
    return (
      <ContenedorDashboard
        titulo="Crear Grupo de Corto Plazo"
        botonRegreso={{ href: '/admin/talleres/abstracto', texto: 'Grupos de corto plazo' }}
      >
        <TarjetaSistema variante="outlined" className="mb-4 p-3 text-sm">
          <TextoSistema variante="sutil">
            No tenés permiso para crear talleres. Necesitás la capability
            <code className="mx-1">talleres_crecimiento.director.write</code>
            o
            <code className="mx-1">talleres_crecimiento.admin.manage</code>.
          </TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  // T3 — the form's equipo picker needs both option lists up front.
  const opciones = await fetchOpcionesEquipoTaller(supabase)

  return (
    <ContenedorDashboard
      titulo="Crear Grupo de Corto Plazo"
      botonRegreso={{ href: '/admin/talleres/abstracto', texto: 'Grupos de corto plazo' }}
    >
      <TarjetaSistema variante="outlined" className="mb-4 p-4">
        <TextoSistema variante="sutil">
          Creá el grupo de corto plazo (programa conceptual). Una vez creado,
          podés abrir ediciones específicas (otoño 2026, primavera 2027, etc.)
          desde la página del grupo — eso es PR23.2.
        </TextoSistema>
      </TarjetaSistema>
      <CrearTallerAbstractoForm opciones={opciones} />
    </ContenedorDashboard>
  )
}
