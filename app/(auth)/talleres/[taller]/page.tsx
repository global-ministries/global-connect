/**
 * T3 (odd/tasks/talleres-configuracion-del-taller.md) — /talleres/[taller]
 * redesigned to the system pattern: cabecera (nombre editable in place
 * through editar_taller, ruta del organigrama, estado), Equipo (the
 * node's real active servidores read from talleres_servidores_del_taller
 * — "Asignar coordinador" is gone, superseded by Dream Team → Servidores),
 * Clases/Grupos (plantilla, editable in place — PlantillaClasesSection/
 * PlantillaGruposSection) and Ediciones.
 *
 * Equipo has three states, in order: no `dream_team_equipo_id` yet (never
 * fetched), a 42501 from talleres_servidores_del_taller (the viewer has no
 * authority over this taller's node — an access-state card, not the empty
 * one), and zero-or-more active servidores (the ordinary list or its empty
 * state). See lib/platform/talleres/servidores-del-taller.ts's
 * CargaServidoresDelTaller for the discriminated result this distinguishes
 * on (B2 correction, T7).
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
 * borrador/cerrado/cancelado ediciones are hidden from them.
 *
 * PERMISSIONS: every control below reads cargarPermisos(client,
 * taller.dream_team_equipo_id) for THIS taller's node — never a flat
 * `caps.includes(...)` check (docs §9, "Permisos en la interfaz").
 * `editarTaller` gates the cabecera's nombre/descripcion edit AND the plantilla edit
 * controls (Decisiones: "edición de plantillas con editar_taller") — the
 * same predicate RLS itself enforces on `talleres` and the three
 * `taller_plantilla_*` tables, so a denied write here can only ever be a
 * stale permisos snapshot, never an app/DB mismatch.
 *
 * Equipo/picker data (talleres_servidores_del_taller) is fetched
 * regardless of editarTaller — a read-only viewer still sees the real
 * team, they just can't add to it.
 *
 * T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6):
 *   - refrescarEstadosEdiciones(client) runs before loadTallerDetalle,
 *     unscoped (the taller's own DB id isn't known until AFTER the slug
 *     lookup this must run before) — best effort, see that module's
 *     header for why the edición page scopes its own call instead.
 *   - A new "Configuración" section (ConfiguracionTaller) right below the
 *     header: tipo, vínculo, régimen, cierre de inscripción, intervalo
 *     entre ediciones, plus cadencia_dias/duracion_minutos MOVED here
 *     from PlantillaClasesSection.
 *   - "Crear edición" (OpenEdicionForm) is now driven by `taller.regimen`
 *     — see that component's own header for the one-question flow. This
 *     page precomputes `temporadasDisponibles` (open temporadas of the
 *     taller's own tree MINUS the ones this taller already has a
 *     non-cancelled edición in, from `taller.ediciones`), since only the
 *     page has `taller.ediciones` to compute that exclusion from.
 *   - `?creadas=N` (redirected here when "crear también las próximas"
 *     created more than one edición) shows a BadgeSistema notice.
 *   - Ediciones rows show "{inicio} → {fin}" alongside the estado badge.
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Layers, Lock, Users } from 'lucide-react'

import {
  ContenedorDashboard,
  BadgeSistema,
  EnlaceSistema,
  TarjetaSistema,
  TextoSistema,
  TituloSistema,
} from '@/components/ui/sistema-diseno'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import { OpenEdicionForm } from '@/components/talleres/open-edicion-form'
import { EditarNombreTaller } from '@/components/talleres/editar-nombre-taller'
import { EditarDescripcionTaller } from '@/components/talleres/editar-descripcion-taller'
import { ConfiguracionTaller } from '@/components/talleres/configuracion-taller'
import { PlantillaClasesSection } from '@/components/talleres/plantilla-clases-section'
import { PlantillaGruposSection } from '@/components/talleres/plantilla-grupos-section'
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
import { fetchRutaEquipo } from '@/lib/platform/talleres/equipo-organigrama'
import { loadServidoresDelTaller, nombreCompletoServidor } from '@/lib/platform/talleres/servidores-del-taller'
import {
  loadPlantillaClases,
  loadPlantillaGrupos,
  previewFacilitadoresOmitidos,
} from '@/lib/platform/talleres/plantilla'
import { loadTemporadasAbiertas } from '@/lib/platform/talleres/temporadas'
import { refrescarEstadosEdiciones } from '@/lib/platform/talleres/refrescar-estados'
import { rutaCatalogo, rutaEdicion } from '@/lib/platform/talleres/rutas'
import { hasDreamTeamReadCapability } from '@/lib/platform/dream-team/capabilities'

const RUTA_SERVIDORES = '/admin/dream-team/servidores'

export const metadata = { title: 'Taller' }

interface RouteContext {
  readonly params: Promise<{ readonly taller: string }>
  readonly searchParams: Promise<{ readonly creadas?: string }>
}

/** Same UTC-anchored formatting OpenEdicionForm's own preview uses, for a `date`-only column (never a timestamptz shift). */
function formatFechaCorta(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('es', { timeZone: 'UTC' })
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
  const { creadas } = await ctx.searchParams

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) {
    return (
      <ContenedorDashboard titulo="Talleres">
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
      <ContenedorDashboard titulo="Talleres">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">No se pudo resolver tu sesión.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase

  // T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — best
  // effort, unscoped (this taller's own DB id isn't known until AFTER the
  // slug lookup right below) — see refrescar-estados.ts's own header.
  await refrescarEstadosEdiciones(client)

  const taller = await loadTallerDetalle(client, slug)
  if (!taller) {
    notFound()
  }

  const permisos = await cargarPermisos(client, taller.dream_team_equipo_id)
  const equipoId = taller.dream_team_equipo_id

  // T11 (odd/tasks/talleres-configuracion-del-taller.md, flow audit) —
  // "Gestionar en Servidores" used to be unconditional and could 404 for a
  // viewer with no Dream Team authority; it now renders only when the
  // viewer passes the SAME hasDreamTeamReadCapability check
  // /admin/dream-team/servidores/page.tsx itself gates on, and only when
  // there is an equipo to deep-link into.
  const puedeGestionarServidores = equipoId !== null && hasDreamTeamReadCapability(session)

  // T4 — only régimen=temporada ever asks for a temporada, so a
  // régimen=cadencia taller never pays for this query.
  const debeCargarTemporadas = permisos.abrirEdicion && taller.regimen === 'temporada'

  const [rutaEquipo, temporadasAbiertas, cargaServidores, plantillaClases, plantillaGrupos] = await Promise.all([
    equipoId ? fetchRutaEquipo(client, equipoId) : Promise.resolve(null),
    debeCargarTemporadas ? loadTemporadasAbiertas(client, taller.id) : Promise.resolve([]),
    equipoId ? loadServidoresDelTaller(client, taller.id) : Promise.resolve({ ok: true, servidores: [] } as const),
    loadPlantillaClases(client, taller.id),
    loadPlantillaGrupos(client, taller.id),
  ])

  // T4 — "Crear edición" (régimen=temporada) excludes temporadas this
  // taller already has a non-cancelled edición in (Decisiones); refreshed
  // above, so a stale stored estado can't leak a cancelled-in-practice
  // edición's temporada back into the list.
  const temporadaIdsUsadas = new Set(
    taller.ediciones
      .filter((edicion) => edicion.estado !== 'cancelado' && edicion.temporada_id !== null)
      .map((edicion) => edicion.temporada_id as string),
  )
  const temporadasDisponibles = temporadasAbiertas.filter((t) => !temporadaIdsUsadas.has(t.id))

  // B2 correction (T7) — a 42501 (no visibility into this taller's node)
  // used to degrade to the SAME empty servidores array as a taller with
  // genuinely zero active servidores, so the Equipo section showed the
  // "sin servidores" empty state for both. `sinAutoridadEquipo` tells the
  // two apart; `servidores` itself stays a plain array for every other
  // consumer below (PlantillaGruposSection's picker options).
  const servidores = cargaServidores.ok ? cargaServidores.servidores : []
  const sinAutoridadEquipo = !cargaServidores.ok && cargaServidores.reason === 'sin_autoridad'

  // T4 — "Crear edición"'s preview no longer asks for a clase count: it
  // derives clasesPorGrupo from the active plantilla, falling back to 1
  // when the taller has none yet — the EXACT same fallback
  // talleres_instanciar_edicion applies server-side (p_sesiones_fallback
  // DEFAULT 1, never asked for by talleres_crear_edicion), so the preview
  // never disagrees with what actually gets created.
  const clasesActivas = plantillaClases.filter((clase) => clase.activo).length
  const clasesPorGrupo = clasesActivas > 0 ? clasesActivas : 1

  // T11 — "Crear edición" preview: how many grupos will be instanced (only
  // ACTIVE plantilla grupos are — same rule open_edicion applies), and
  // which of their facilitadores are no longer active servidores of this
  // equipo and would be omitted (acceptance criterion 3, previewed before
  // the director confirms instead of only after).
  const gruposPlantillaActivosList = plantillaGrupos.filter((grupo) => grupo.activo)
  const servidorPersonaIds = new Set(servidores.map((servidor) => servidor.personaId))
  const facilitadoresOmitidosPreview = previewFacilitadoresOmitidos(
    gruposPlantillaActivosList,
    servidorPersonaIds,
  )

  return (
    <ContenedorDashboard
      titulo={taller.nombre}
      botonRegreso={{ href: rutaCatalogo(), texto: 'Talleres' }}
    >
      <TarjetaSistema variante="outlined" className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            {permisos.editarTaller ? (
              <EditarNombreTaller tallerId={taller.id} tallerSlug={taller.slug} nombre={taller.nombre} />
            ) : (
              // T10 (design audit) — the page's own <h1> already comes
              // from ContenedorDashboard (DesktopHeader); this nombre is
              // a level-2 heading, never a duplicate h1, and the slug is
              // gone (it was only ever an internal identifier).
              <TituloSistema nivel={2}>{taller.nombre}</TituloSistema>
            )}
            {permisos.editarTaller ? (
              <EditarDescripcionTaller
                tallerId={taller.id}
                tallerSlug={taller.slug}
                descripcion={taller.descripcion}
              />
            ) : (
              taller.descripcion && (
                <TextoSistema className="mt-2 block">{taller.descripcion}</TextoSistema>
              )
            )}
            {rutaEquipo && (
              // T11 (flow audit) — taller -> node: a link back to the
              // org chart when the viewer can actually see it (same
              // hasDreamTeamReadCapability gate as "Gestionar en
              // Servidores" above), plain text otherwise — a link that
              // 404s is worse than no link.
              <TextoSistema variante="sutil" tamaño="sm" className="mt-2 block">
                {hasDreamTeamReadCapability(session) ? (
                  <Link href="/admin/dream-team/estructura" className="hover:underline">
                    {rutaEquipo}
                  </Link>
                ) : (
                  rutaEquipo
                )}
              </TextoSistema>
            )}
          </div>
          <BadgeSistema variante={tallerEstadoBadgeVariante(taller.estado)}>
            {tallerEstadoLabel(taller.estado)}
          </BadgeSistema>
        </div>
      </TarjetaSistema>

      {/* T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) —
          redirected here from OpenEdicionForm after "crear también las
          próximas" creates more than one edición at once. */}
      {creadas && Number(creadas) > 0 && (
        <BadgeSistema variante="success" role="status">
          {`Se crearon ${creadas} ediciones`}
        </BadgeSistema>
      )}

      <ConfiguracionTaller
        tallerId={taller.id}
        tallerSlug={taller.slug}
        tipo={taller.tipo}
        vinculo={taller.vinculo}
        regimen={taller.regimen}
        cierreInscripcionOffsetDias={taller.cierre_inscripcion_offset_dias}
        intervaloEdicionesDias={taller.intervalo_ediciones_dias}
        clasesMinimasParaCompletar={taller.clases_minimas_para_completar}
        momentoEnvioAcceso={taller.momento_envio_acceso}
        cadenciaDias={taller.cadencia_dias}
        duracionMinutos={taller.duracion_minutos}
        puedeEditar={permisos.editarTaller}
      />

      {/* T11 (flow audit) — "Pasos para abrir una edición": right under the
          header, so a director sees at a glance what's left before "Crear
          edición" makes sense to press. Only for editarTaller — the same
          capacity that gates the plantilla edit controls below. */}
      {permisos.editarTaller && (
        <TarjetaSistema className="p-0">
          <div className="p-4 pb-0">
            <TituloSistema nivel={2}>Pasos para abrir una edición</TituloSistema>
          </div>
          <div className="divide-y divide-border">
            {[
              { etiqueta: 'Equipo del nodo', listo: servidores.length > 0 },
              { etiqueta: 'Plantilla de clases', listo: clasesActivas > 0 },
              { etiqueta: 'Plantilla de grupos', listo: gruposPlantillaActivosList.length > 0 },
            ].map((paso) => (
              <div key={paso.etiqueta} className="flex items-center justify-between gap-3 p-4">
                <TextoSistema>{paso.etiqueta}</TextoSistema>
                <BadgeSistema variante={paso.listo ? 'success' : 'warning'}>
                  {paso.listo ? 'Listo' : 'Pendiente'}
                </BadgeSistema>
              </div>
            ))}
            <Link
              href="#ediciones"
              className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-accent"
            >
              <TextoSistema className="font-medium">
                {/* T4 — the checklist's own final step names the ONE
                    question "Crear edición" will actually ask, by régimen. */}
                {taller.regimen === 'cadencia' ? 'Crear edición (primera clase)' : 'Crear edición (elige la temporada)'}
              </TextoSistema>
              <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </div>
        </TarjetaSistema>
      )}

      <section aria-labelledby="equipo-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <TituloSistema nivel={2} id="equipo-heading">
              Equipo del nodo
            </TituloSistema>
            <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
              Servidores activos; se gestionan en Dream Team.
            </TextoSistema>
          </div>
          {puedeGestionarServidores && (
            <EnlaceSistema
              href={`${RUTA_SERVIDORES}?equipo=${equipoId}`}
              variante="marca"
              className="inline-flex min-h-[44px] items-center text-sm"
            >
              Gestionar en Servidores
            </EnlaceSistema>
          )}
        </div>

        {sinAutoridadEquipo ? (
          <div className="mt-3">
            <EstadoVacio
              icono={Lock}
              titulo="No tienes autoridad para ver el equipo de este taller."
            />
          </div>
        ) : servidores.length === 0 ? (
          <div className="mt-3">
            <EstadoVacio
              icono={Users}
              titulo="Sin servidores activos en este equipo"
              subtitulo="Asigna servidores en Dream Team → Servidores para que aparezcan acá."
            />
          </div>
        ) : (
          <ul className="mt-3 grid gap-2">
            {servidores.map((servidor) => (
              <li key={servidor.personaId}>
                <TarjetaSistema variante="outlined" className="flex items-center justify-between gap-3 p-3">
                  <TextoSistema className="min-w-0 truncate font-medium">
                    {nombreCompletoServidor(servidor)}
                  </TextoSistema>
                  <TextoSistema variante="sutil" tamaño="sm">
                    {servidor.rolServicio ?? '—'}
                  </TextoSistema>
                </TarjetaSistema>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PlantillaClasesSection
        tallerId={taller.id}
        tallerSlug={taller.slug}
        clases={plantillaClases}
        puedeEditar={permisos.editarTaller}
      />

      <PlantillaGruposSection
        tallerId={taller.id}
        tallerSlug={taller.slug}
        grupos={plantillaGrupos}
        servidores={servidores}
        puedeEditar={permisos.editarTaller}
      />

      {/* T11 — id="ediciones" is the checklist's "Crear edición" #ediciones anchor landing target. */}
      <section aria-labelledby="ediciones-heading" id="ediciones">
        <TituloSistema nivel={2} id="ediciones-heading">
          Ediciones
        </TituloSistema>

        {taller.ediciones.length === 0 ? (
          <div className="mt-3">
            <EstadoVacio
              icono={Layers}
              titulo="Este taller todavía no tiene ediciones"
              subtitulo="Usa «Abrir edición» más abajo para abrir la primera."
            />
          </div>
        ) : (
          // T10 (design audit) — the ediciones used to be a `grid gap-3` of
          // separate elevated cards; now ONE TarjetaSistema p-0 with
          // divide-y rows, the same list pattern the rest of the system
          // uses (estructura-client.tsx / nodo-fila.tsx).
          <TarjetaSistema className="mt-3 p-0">
            <div className="divide-y divide-border">
              {taller.ediciones.map((edicion) => (
                <Link
                  key={edicion.id}
                  href={rutaEdicion(taller.slug, edicion.id)}
                  className="flex items-center gap-3 p-4 transition-colors hover:bg-accent"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 break-words font-medium text-foreground">
                        {edicion.nombre_snapshot}
                      </span>
                      <BadgeSistema variante={edicionEstadoBadgeVariante(edicion.estado)} tamaño="sm">
                        {edicionEstadoLabel(edicion.estado)}
                      </BadgeSistema>
                    </div>
                    <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
                      {/* T4 — "{inicio} → {fin}" from the edición's own real
                          dates (CatalogoEdicion), never a periodo snapshot. */}
                      {formatFechaCorta(edicion.fecha_inicio)} → {formatFechaCorta(edicion.fecha_fin)}
                      {' · '}
                      {edicion.total_inscripciones}{' '}
                      {edicion.total_inscripciones === 1 ? 'inscrito' : 'inscritos'}
                    </TextoSistema>
                  </div>
                  <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </TarjetaSistema>
        )}
      </section>

      {permisos.abrirEdicion && (
        <div>
          <OpenEdicionForm
            tallerId={taller.id}
            tallerSlug={taller.slug}
            tallerNombre={taller.nombre}
            regimen={taller.regimen}
            temporadasDisponibles={temporadasDisponibles}
            intervaloEdicionesDias={taller.intervalo_ediciones_dias}
            cadenciaDias={taller.cadencia_dias}
            cierreInscripcionOffsetDias={taller.cierre_inscripcion_offset_dias}
            clasesPorGrupo={clasesPorGrupo}
            gruposPlantillaActivos={gruposPlantillaActivosList.length}
            facilitadoresOmitidosPreview={facilitadoresOmitidosPreview}
          />
        </div>
      )}

    </ContenedorDashboard>
  )
}
