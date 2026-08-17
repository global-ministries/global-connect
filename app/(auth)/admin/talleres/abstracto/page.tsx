/**
 * PR23.1 — /admin/talleres/abstracto (RSC + client).
 *
 * Lists the existing abstract talleres (backfilled by the data
 * migration from the old metadata). For now this is read-only —
 * the create form is at /admin/talleres/abstracto/nuevo.
 *
 * RSC fetches the catalog. A small client wrapper renders the create
 * form.
 */

import Link from 'next/link'

import { ContenedorDashboard, TarjetaSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'

import { CrearTallerAbstractoForm } from './nuevo/crear-form'

export const metadata = { title: 'Grupos de Corto Plazo' }

interface TallerRow {
  id: string
  slug: string
  nombre: string
  modalidad_default: 'periodo_general' | 'permanente_custom'
  estado: 'active' | 'archived'
  created_at: string
}

export default async function TalleresAbstractosIndex() {
  if (!isTalleresEnabled()) {
    return (
    <ContenedorDashboard titulo="Grupos de Corto Plazo">
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
    <ContenedorDashboard titulo="Grupos de Corto Plazo">
      <TarjetaSistema variante="outlined" className="p-6 text-center">
        <TextoSistema variante="sutil">Necesitás iniciar sesión.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  // Capability gate (server-side). The page also needs director.write
  // or admin.manage to view the admin tools.
  const session = await resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) =>
      findPlatformSessionPersonaByAuthId(supabase, authId),
    capabilitySupabase: supabase,
  })
  if (!session) {
    return (
    <ContenedorDashboard titulo="Grupos de Corto Plazo">
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase
  const { data: talleresData } = await client
    .from('talleres')
    .select('id, slug, nombre, modalidad_default, estado, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  const talleres: TallerRow[] = (talleresData ?? []) as TallerRow[]

  return (
    <ContenedorDashboard
      titulo="Grupos de Corto Plazo"
      botonRegreso={{ href: '/dashboard', texto: 'Inicio' }}
    >
      <TarjetaSistema variante="outlined" className="mb-4 p-4">
        <TextoSistema variante="sutil">
          Un <strong>grupo de corto plazo</strong> es el programa conceptual
          (ej. &quot;Matrimonio sobre la Roca&quot;). Cada <strong>edición</strong>
          (otoño 2026, primavera 2027, etc.) es una ocurrencia específica
          con sus propias cohortes, sesiones e inscripciones. Esta página lista
          los grupos. Para crear uno nuevo usá el formulario de abajo. Para
          abrir una edición específica de un grupo existente, usá la página
          del grupo (PR23.2).
        </TextoSistema>
      </TarjetaSistema>

      {hasCap ? (
        <div className="mb-6">
          <CrearTallerAbstractoForm />
        </div>
      ) : (
        <TarjetaSistema variante="outlined" className="mb-4 p-3 text-sm">
          <TextoSistema variante="sutil">
            No tenés permiso para crear talleres. Necesitás la capability
            <code className="mx-1">talleres_crecimiento.director.write</code>
            o
            <code className="mx-1">talleres_crecimiento.admin.manage</code>.
          </TextoSistema>
        </TarjetaSistema>
      )}

      {talleres.length === 0 ? (
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">
            No hay grupos de corto plazo todavía. Creá el primero arriba.
          </TextoSistema>
        </TarjetaSistema>
      ) : (
        <ul className="grid gap-3">
          {talleres.map((t) => (
            <li key={t.id}>
              <TarjetaSistema variante="elevated" className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <Link
                      href={`/admin/talleres/abstracto/${t.slug}`}
                      className="font-medium hover:underline"
                    >
                      {t.nombre}
                    </Link>
                    <TextoSistema variante="sutil" className="mt-1 block text-sm">
                      <code>{t.slug}</code> · {t.modalidad_default === 'periodo_general' ? 'Periodo general' : 'Permanente custom'} ·{' '}
                      Creado el {new Date(t.created_at).toLocaleDateString('es')}
                    </TextoSistema>
                  </div>
                  <BadgeSistema variante={t.estado === 'active' ? 'success' : 'default'}>
                    {t.estado}
                  </BadgeSistema>
                </div>
              </TarjetaSistema>
            </li>
          ))}
        </ul>
      )}
    </ContenedorDashboard>
  )
}
