/**
 * T8 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/temporadas/
 * [id], replacing app/(auth)/admin/talleres/temporadas/[id]/page.tsx (kept
 * alive, unmodified, until T10 deletes it).
 *
 * The control surface for a single global season: every active taller
 * with a checkbox reflecting talleres_temporada_talleres membership (the
 * "elijo qué talleres abren" flow), plus estado-transition buttons.
 *
 * GATE, same shape as the list page: flag -> user -> session, each an
 * informational card. No role required — RLS on talleres_temporadas_select
 * decides whether the row is even reachable; a genuinely missing id still
 * 404s via notFound(), exactly like the old page.
 *
 * PERMISSIONS: `canWrite` is the same flat capability check as the list
 * page (director.write OR admin.manage) — see ../actions.ts's header for
 * the evidence this mirrors talleres_temporadas' own UNSCOPED RLS
 * predicate, not a `cargarPermisos(client, equipoId)` node lookup.
 */

import { notFound } from 'next/navigation'

import {
  ContenedorDashboard,
  TarjetaSistema,
  TextoSistema,
  BadgeSistema,
} from '@/components/ui/sistema-diseno'
import { temporadaEstadoLabel, temporadaEstadoBadgeVariante } from '@/components/talleres/labels'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { loadTemporadaDetalle } from '@/lib/platform/talleres/temporadas'
import { rutaTemporadas } from '@/lib/platform/talleres/rutas'

import { TemporadaDetailClient } from './temporada-detail-client'

export const metadata = { title: 'Temporada' }

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
}

export default async function TemporadaDetallePage(ctx: RouteContext) {
  if (!isTalleresEnabled()) {
    return (
      <ContenedorDashboard titulo="Temporada">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">El módulo de talleres está deshabilitado.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  const { id } = await ctx.params

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) {
    return (
      <ContenedorDashboard titulo="Temporada">
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
      <ContenedorDashboard titulo="Temporada">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">No se pudo resolver tu sesión.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  const caps = session.capabilities.map((c) => c.key)
  const canWrite =
    caps.includes('talleres_crecimiento.director.write') ||
    caps.includes('talleres_crecimiento.admin.manage')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase
  const detalle = await loadTemporadaDetalle(client, id)
  if (!detalle) {
    notFound()
  }
  const { temporada, talleres, selectedTallerIds } = detalle

  return (
    <ContenedorDashboard
      titulo={temporada.nombre}
      botonRegreso={{ href: rutaTemporadas(), texto: 'Temporadas' }}
    >
      <TarjetaSistema variante="outlined" className="mb-4 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1">
            <TextoSistema className="text-sm text-muted-foreground">
              <code>{temporada.slug}</code>
            </TextoSistema>
            {temporada.descripcion && (
              <TextoSistema className="mt-2 block">{temporada.descripcion}</TextoSistema>
            )}
            <TextoSistema variante="sutil" className="mt-2 block text-sm">
              {new Date(temporada.fecha_apertura).toLocaleDateString('es')}
              {' → '}
              {new Date(temporada.fecha_cierre).toLocaleDateString('es')}
            </TextoSistema>
          </div>
          <BadgeSistema variante={temporadaEstadoBadgeVariante(temporada.estado)}>
            {temporadaEstadoLabel(temporada.estado)}
          </BadgeSistema>
        </div>
      </TarjetaSistema>

      <TemporadaDetailClient
        temporadaId={temporada.id}
        estado={temporada.estado}
        canWrite={canWrite}
        talleres={talleres}
        selectedTallerIds={selectedTallerIds}
      />
    </ContenedorDashboard>
  )
}
