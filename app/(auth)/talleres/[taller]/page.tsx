/**
 * T3 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/[taller], the
 * taller detail screen. Replaces
 * app/(auth)/admin/talleres/abstracto/[slug]/page.tsx — read that page (and
 * its actions.ts) for what this ports; the two forms it renders
 * (OpenEdicionForm, AssignServicioForm) moved to components/talleres/ so
 * both pages share them (the old page keeps working until T10).
 *
 * `[taller]` is the taller's SLUG (docs/talleres-de-punta-a-punta.md §8's
 * "de 32 a once" tree), resolved via lib/platform/talleres/rutas.ts's
 * builders — never a hand-written template string.
 *
 * GATE, same shape as /talleres (app/(auth)/talleres/page.tsx): flag ->
 * user -> session, each an informational card. Then a slug lookup:
 * `talleres` is world-readable (talleres_select_all, USING true, verified
 * live against staging pg_policies), so notFound() only fires for a
 * genuinely unknown slug. It is NOT a stand-in for "you can't see this
 * taller" — a viewer outside the taller's branch still gets the full
 * header (name, estado badge, org-chart path if resolvable) and the
 * taller's `abierto`/`en_curso` ediciones (taller_ediciones_select ORs a
 * plain "any authenticated user" clause for those two estados); only
 * borrador/cerrado/cancelado ediciones are hidden from them. Confirmed
 * live in staging with a zero-capability authenticated role against a
 * real borrador fixture: the talleres row stayed visible (count 1), the
 * borrador edición did not (count 0).
 *
 * PERMISSIONS: every control below reads cargarPermisos(client,
 * taller.dream_team_equipo_id) for THIS taller's node — never a flat
 * `caps.includes(...)` check (docs §9, "Permisos en la interfaz"). This is
 * a real behavior change from the old page (which gated both forms on one
 * flat `director.write || admin.manage`): `asignar_equipo` also grants
 * `coordinator.write`, so a scoped coordinator now correctly sees the
 * "equipo del taller" form the old page hid from them.
 *
 * `editar_taller` has no control here: the old page has no taller-level
 * edit UI (no rename/re-describe form) — only a read-only info card. T3
 * does not invent one; if/when such a control is added, it must read
 * `permisos.editarTaller`, never a flat capability check.
 *
 * T4 (odd/tasks/talleres-consolidar-pantallas.md) — ediciones now link to
 * rutaEdicion(taller.slug, edicion.id): /talleres/[taller]/[edicion] exists.
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'

import {
  ContenedorDashboard,
  BadgeSistema,
  TarjetaSistema,
  TextoSistema,
} from '@/components/ui/sistema-diseno'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import { OpenEdicionForm } from '@/components/talleres/open-edicion-form'
import { AssignServicioForm } from '@/components/talleres/assign-servicio-form'
import {
  edicionEstadoBadgeVariante,
  edicionEstadoLabel,
  tallerEstadoBadgeVariante,
  tallerEstadoLabel,
} from '@/components/talleres/labels'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { loadTallerDetalle } from '@/lib/platform/talleres/catalogo'
import { cargarPermisos } from '@/lib/platform/talleres/permisos'
import { fetchCoordinadorRoles, fetchRutaEquipo } from '@/lib/platform/talleres/equipo-organigrama'
import { loadTemporadasAbiertas } from '@/lib/platform/talleres/temporadas'
import { rutaCatalogo, rutaEdicion } from '@/lib/platform/talleres/rutas'
import { Layers } from 'lucide-react'

export const metadata = { title: 'Taller' }

interface RouteContext {
  readonly params: Promise<{ readonly taller: string }>
}

export default async function TallerDetallePage(ctx: RouteContext) {
  if (!isTalleresEnabled()) {
    return (
      <ContenedorDashboard titulo="Talleres">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">El módulo de talleres está deshabilitado.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  const { taller: slug } = await ctx.params

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) {
    return (
      <ContenedorDashboard titulo="Talleres">
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
      <ContenedorDashboard titulo="Talleres">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">No se pudo resolver tu sesión.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase
  const taller = await loadTallerDetalle(client, slug)
  if (!taller) {
    notFound()
  }

  const permisos = await cargarPermisos(client, taller.dream_team_equipo_id)
  const equipoId = taller.dream_team_equipo_id

  const [rutaEquipo, temporadasAbiertas, equipoRoles] = await Promise.all([
    equipoId ? fetchRutaEquipo(client, equipoId) : Promise.resolve(null),
    permisos.abrirEdicion ? loadTemporadasAbiertas(client) : Promise.resolve([]),
    permisos.asignarEquipo && equipoId ? fetchCoordinadorRoles(client, equipoId) : Promise.resolve([]),
  ])

  return (
    <ContenedorDashboard
      titulo={taller.nombre}
      botonRegreso={{ href: rutaCatalogo(), texto: 'Talleres' }}
    >
      <TarjetaSistema variante="outlined" className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <TextoSistema variante="sutil" tamaño="sm" className="block">
              <code>{taller.slug}</code>
            </TextoSistema>
            {taller.descripcion && (
              <TextoSistema className="mt-2 block">{taller.descripcion}</TextoSistema>
            )}
            {rutaEquipo && (
              <TextoSistema variante="sutil" tamaño="sm" className="mt-2 block">
                {rutaEquipo}
              </TextoSistema>
            )}
          </div>
          <BadgeSistema variante={tallerEstadoBadgeVariante(taller.estado)}>
            {tallerEstadoLabel(taller.estado)}
          </BadgeSistema>
        </div>
      </TarjetaSistema>

      <section aria-labelledby="ediciones-heading">
        <h2 id="ediciones-heading" className="text-lg font-semibold tracking-tight sm:text-xl">
          Ediciones
        </h2>

        {taller.ediciones.length === 0 ? (
          <div className="mt-3">
            <EstadoVacio
              icono={Layers}
              titulo="Este taller todavía no tiene ediciones"
              subtitulo="Usá «Abrir edición» más abajo para abrir la primera."
            />
          </div>
        ) : (
          <ul className="mt-3 grid gap-3">
            {taller.ediciones.map((edicion) => (
              <li key={edicion.id}>
                <Link href={rutaEdicion(taller.slug, edicion.id)} className="block">
                  <TarjetaSistema
                    variante="elevated"
                    className="p-4 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 break-words font-medium text-foreground">
                        {edicion.nombre_snapshot}
                      </span>
                      <BadgeSistema variante={edicionEstadoBadgeVariante(edicion.estado)} tamaño="sm">
                        {edicionEstadoLabel(edicion.estado)}
                      </BadgeSistema>
                    </div>
                    <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
                      {edicion.total_inscripciones}{' '}
                      {edicion.total_inscripciones === 1 ? 'inscrito' : 'inscritos'}
                    </TextoSistema>
                  </TarjetaSistema>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {permisos.abrirEdicion && (
        <div>
          <OpenEdicionForm
            tallerId={taller.id}
            tallerNombre={taller.nombre}
            defaultModalidad={taller.modalidad_default}
            temporadasAbiertas={temporadasAbiertas}
          />
        </div>
      )}

      {permisos.asignarEquipo && (
        <div>
          <AssignServicioForm tallerId={taller.id} equipoId={equipoId} roles={equipoRoles} />
        </div>
      )}
    </ContenedorDashboard>
  )
}
