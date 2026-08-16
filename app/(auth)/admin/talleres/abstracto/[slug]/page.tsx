/**
 * PR23.2a — /admin/talleres/abstracto/[slug] (RSC).
 *
 * Detail page for a single abstract taller. Lists all its ediciones
 * (backfilled + new ones from open_edicion) and renders the
 * "abrir nueva edición" form.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ContenedorDashboard, TarjetaSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'

import { OpenEdicionForm } from './open-edicion-form'

export const metadata = { title: 'Grupo de Corto Plazo' }

interface RouteContext {
  readonly params: Promise<{ readonly slug: string }>
}

interface TallerRow {
  id: string
  slug: string
  nombre: string
  descripcion: string | null
  modalidad_default: 'periodo_general' | 'permanente_custom'
  estado: 'active' | 'archived'
}

interface EdicionRow {
  id: string
  nombre_snapshot: string
  estado: 'borrador' | 'abierto' | 'en_curso' | 'cerrado' | 'cancelado'
  created_at: string
}

export default async function TallerAbstractoDetailPage(ctx: RouteContext) {
  if (!isTalleresEnabled()) {
    return (
      <ContenedorDashboard titulo="Grupo de Corto Plazo">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">El módulo de talleres está deshabilitado.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  const { slug } = await ctx.params

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) {
    return (
      <ContenedorDashboard titulo="Grupo de Corto Plazo">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">Necesitás iniciar sesión.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase
  const { data: tallerData, error: tallerError } = await client
    .from('talleres')
    .select('id, slug, nombre, descripcion, modalidad_default, estado')
    .eq('slug', slug)
    .maybeSingle()

  if (tallerError || !tallerData) {
    notFound()
  }
  const taller = tallerData as TallerRow

  // Capability gate (server-side)
  const session = await resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) =>
      findPlatformSessionPersonaByAuthId(supabase, authId),
    capabilitySupabase: supabase,
  })
  const caps = session?.capabilities.map((c) => c.key) ?? []
  const hasCap =
    caps.includes('talleres_crecimiento.director.write') ||
    caps.includes('talleres_crecimiento.admin.manage')

  // PR29-D — load the global association for the banner (if any).
  // Query the most recent local edition to read its edicion_global_id
  // (the canonical place where the FK lives per PR29-B).
  const { data: edicionConGlobal } = await client
    .from('talleres_crecimiento_metadata')
    .select('edicion_global_id')
    .eq('taller_id', taller.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const edicionGlobalId: string | null =
    (edicionConGlobal as { edicion_global_id: string | null } | null)?.edicion_global_id ?? null

  let edicionGlobalSummary: { id: string; nombre: string; estado: 'borrador' | 'abierto' | 'cerrado' | 'cancelado' } | null = null
  if (edicionGlobalId) {
    const { data: g } = await client
      .from('taller_ediciones_globales')
      .select('id, nombre, estado')
      .eq('id', edicionGlobalId)
      .maybeSingle()
    if (g) {
      edicionGlobalSummary = g as { id: string; nombre: string; estado: 'borrador' | 'abierto' | 'cerrado' | 'cancelado' }
    }
  }

  // Fetch ediciones for this taller
  const { data: edicionesData } = await client
    .from('talleres_crecimiento_metadata')
    .select('id, nombre_snapshot, estado, created_at')
    .eq('taller_id', taller.id)
    .order('created_at', { ascending: false })
    .limit(100)

  const ediciones: EdicionRow[] = (edicionesData ?? []) as EdicionRow[]

  return (
    <ContenedorDashboard
      titulo={taller.nombre}
      botonRegreso={{ href: '/admin/talleres/abstracto', texto: 'Grupos de corto plazo' }}
    >
      <TarjetaSistema variante="outlined" className="mb-4 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1">
            <TextoSistema className="text-sm text-muted-foreground">
              <code>{taller.slug}</code>
            </TextoSistema>
            {taller.descripcion && (
              <TextoSistema className="mt-2 block">{taller.descripcion}</TextoSistema>
            )}
            <TextoSistema variante="sutil" className="mt-2 block text-sm">
              Modalidad default:{' '}
              {taller.modalidad_default === 'periodo_general'
                ? 'Periodo general'
                : 'Permanente custom'}
            </TextoSistema>
          </div>
          <BadgeSistema variante={taller.estado === 'active' ? 'success' : 'default'}>
            {taller.estado}
          </BadgeSistema>
        </div>
      </TarjetaSistema>

      {/* PR29-D — Cross-link banner: this taller's current global. */}
      {edicionGlobalSummary ? (
        <TarjetaSistema variante="outlined" className="mb-4 p-3 text-sm">
          <TextoSistema>
            Esta edición pertenece a la global:{' '}
            <Link
              href={`/admin/talleres/ediciones-globales/${edicionGlobalSummary.id}`}
              className="font-medium text-[var(--brand-primary)] hover:underline"
            >
              {edicionGlobalSummary.nombre}
            </Link>{' '}
            <BadgeSistema
              tamaño="sm"
              variante={
                edicionGlobalSummary.estado === 'abierto'
                  ? 'success'
                  : edicionGlobalSummary.estado === 'borrador'
                    ? 'info'
                    : edicionGlobalSummary.estado === 'cancelado'
                      ? 'error'
                      : 'default'
              }
            >
              {edicionGlobalSummary.estado}
            </BadgeSistema>
          </TextoSistema>
        </TarjetaSistema>
      ) : hasCap ? (
        <TarjetaSistema
          variante="outlined"
          className="mb-4 border-yellow-400 bg-yellow-50 p-3 text-sm"
        >
          <TextoSistema>
            <strong>⚠ Sin global asociada</strong> — este taller no está en
            ninguna edición global.{' '}
            <Link
              href="/admin/talleres/ediciones-globales"
              className="font-medium text-[var(--brand-primary)] hover:underline"
            >
              Asociar a una edición global existente →
            </Link>
          </TextoSistema>
        </TarjetaSistema>
      ) : null}

      {hasCap && (
        <div className="mb-6">
          <OpenEdicionForm
            tallerId={taller.id}
            tallerNombre={taller.nombre}
            defaultModalidad={taller.modalidad_default}
          />
        </div>
      )}

      <TextoSistema className="mb-2 block font-medium">
        Ediciones ({ediciones.length})
      </TextoSistema>

      {ediciones.length === 0 ? (
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">
            Este grupo todavía no tiene ediciones. Usá el formulario de arriba para abrir la primera.
          </TextoSistema>
        </TarjetaSistema>
      ) : (
        <ul className="grid gap-3">
          {ediciones.map((e) => (
            <li key={e.id}>
              <TarjetaSistema variante="elevated" className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <Link
                      href={`/admin/talleres/edicion/${e.id}`}
                      className="font-medium hover:underline"
                    >
                      {e.nombre_snapshot}
                    </Link>
                    <TextoSistema variante="sutil" className="mt-1 block text-sm">
                      Creada el {new Date(e.created_at).toLocaleDateString('es')}
                    </TextoSistema>
                  </div>
                  <BadgeSistema
                    variante={
                      e.estado === 'abierto' || e.estado === 'en_curso'
                        ? 'success'
                        : e.estado === 'borrador'
                          ? 'info'
                          : 'default'
                    }
                  >
                    {e.estado}
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
