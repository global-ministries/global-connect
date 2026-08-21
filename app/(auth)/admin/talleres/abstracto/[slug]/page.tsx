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

interface TemporadaOption {
  id: string
  nombre: string
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

  // Fetch ediciones for this taller
  const { data: edicionesData } = await client
    .from('taller_ediciones')
    .select('id, nombre_snapshot, estado, created_at')
    .eq('taller_id', taller.id)
    .order('created_at', { ascending: false })
    .limit(100)

  const ediciones: EdicionRow[] = (edicionesData ?? []) as EdicionRow[]

  // PR46 — open seasons (talleres_temporadas) for the "Temporada" picker in
  // the open-edición form. RLS-gated (metrics.read OR director.read OR
  // admin.manage): if the caller lacks read on seasons the list comes back
  // empty and the form just offers "— Sin temporada —" (graceful degradation).
  let temporadasAbiertas: TemporadaOption[] = []
  if (hasCap) {
    const { data: temporadasData } = await client
      .from('talleres_temporadas')
      .select('id, nombre')
      .eq('estado', 'abierto')
      .order('fecha_apertura', { ascending: false })
      .limit(100)
    temporadasAbiertas = (temporadasData ?? []) as TemporadaOption[]
  }

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

      {hasCap && (
        <div className="mb-6">
          <OpenEdicionForm
            tallerId={taller.id}
            tallerNombre={taller.nombre}
            defaultModalidad={taller.modalidad_default}
            temporadasAbiertas={temporadasAbiertas}
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
