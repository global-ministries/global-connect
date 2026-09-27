/**
 * T8 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/temporadas/
 * [id], replacing app/(auth)/admin/talleres/temporadas/[id]/page.tsx (kept
 * alive, unmodified, until T10 deletes it).
 *
 * T5 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — the header
 * now shows this temporada's own dirección (its root node label,
 * loadTemporadaDetalle's own `direccionLabel`) instead of the slug, and
 * `refrescarEstadosEdiciones(client)` runs UNSCOPED before the read (this
 * screen's ediciones span several talleres, unlike the taller/edición
 * pages which scope their own call) so every edición's own effective
 * state is accurate before TemporadaDetailClient's badges render.
 * `?creadas=N` (redirected here from the "Crear temporada" form) shows the
 * SAME BadgeSistema notice /talleres/[taller] already uses for its own
 * "crear también las próximas".
 *
 * GATE, same shape as the list page: flag -> user -> session, each an
 * informational card. No role required — RLS on talleres_temporadas_select
 * decides whether the row is even reachable; a genuinely missing id still
 * 404s via notFound().
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
import { refrescarEstadosEdiciones } from '@/lib/platform/talleres/refrescar-estados'
import { rutaTemporadas } from '@/lib/platform/talleres/rutas'

import { TemporadaDetailClient } from './temporada-detail-client'

export const metadata = { title: 'Temporada' }

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
  readonly searchParams: Promise<{ readonly creadas?: string }>
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
  const { creadas } = await ctx.searchParams

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) {
    return (
      <ContenedorDashboard titulo="Temporada">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">Necesitas iniciar sesión.</TextoSistema>
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
  await refrescarEstadosEdiciones(client)
  const detalle = await loadTemporadaDetalle(client, id)
  if (!detalle) {
    notFound()
  }
  const { temporada, direccionLabel, talleresEnTemporada, talleresDisponibles } = detalle

  return (
    <ContenedorDashboard
      titulo={temporada.nombre}
      botonRegreso={{ href: rutaTemporadas(), texto: 'Temporadas' }}
    >
      {creadas && Number(creadas) > 0 && (
        <BadgeSistema variante="success" role="status">
          {`Se crearon ${creadas} ediciones`}
        </BadgeSistema>
      )}

      <TarjetaSistema variante="outlined" className="mb-4 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1">
            <TextoSistema variante="sutil" className="block text-sm">
              {direccionLabel}
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
        talleresEnTemporada={talleresEnTemporada}
        talleresDisponibles={talleresDisponibles}
      />
    </ContenedorDashboard>
  )
}
