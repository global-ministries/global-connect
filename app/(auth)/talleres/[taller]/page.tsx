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
import { rutaCatalogo, rutaEdicion } from '@/lib/platform/talleres/rutas'

const RUTA_SERVIDORES = '/admin/dream-team/servidores'

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
  const taller = await loadTallerDetalle(client, slug)
  if (!taller) {
    notFound()
  }

  const permisos = await cargarPermisos(client, taller.dream_team_equipo_id)
  const equipoId = taller.dream_team_equipo_id

  const [rutaEquipo, temporadasAbiertas, cargaServidores, plantillaClases, plantillaGrupos] = await Promise.all([
    equipoId ? fetchRutaEquipo(client, equipoId) : Promise.resolve(null),
    permisos.abrirEdicion ? loadTemporadasAbiertas(client) : Promise.resolve([]),
    equipoId ? loadServidoresDelTaller(client, taller.id) : Promise.resolve({ ok: true, servidores: [] } as const),
    loadPlantillaClases(client, taller.id),
    loadPlantillaGrupos(client, taller.id),
  ])

  // B2 correction (T7) — a 42501 (no visibility into this taller's node)
  // used to degrade to the SAME empty servidores array as a taller with
  // genuinely zero active servidores, so the Equipo section showed the
  // "sin servidores" empty state for both. `sinAutoridadEquipo` tells the
  // two apart; `servidores` itself stays a plain array for every other
  // consumer below (PlantillaGruposSection's picker options).
  const servidores = cargaServidores.ok ? cargaServidores.servidores : []
  const sinAutoridadEquipo = !cargaServidores.ok && cargaServidores.reason === 'sin_autoridad'

  // "Crear edición" derives sesiones estimadas from the active plantilla
  // clases when the taller has one (Decisiones). A taller with NO active
  // plantilla clases keeps today's form untouched (acceptance criterion
  // 8): `null` tells OpenEdicionForm to show its own "sesiones" field
  // again, exactly as before — there is no silent numeric fallback here.
  const clasesActivas = plantillaClases.filter((clase) => clase.activo).length
  const sesionesEstimadas = clasesActivas > 0 ? clasesActivas : null

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

  // T11 — "Duración por sesión (min)" is gone from the form; it now lives
  // on the taller (`duracion_minutos`, editable in PlantillaClasesSection).
  // 60 is the same default the old inline field used to start from, for a
  // taller that hasn't set one yet.
  const duracionMinutos = taller.duracion_minutos ?? 60

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
              <TextoSistema className="font-medium">Crear edición</TextoSistema>
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
          <EnlaceSistema
            href={RUTA_SERVIDORES}
            variante="marca"
            className="inline-flex min-h-[44px] items-center text-sm"
          >
            Gestionar en Servidores
          </EnlaceSistema>
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
        cadenciaDias={taller.cadencia_dias}
        duracionMinutos={taller.duracion_minutos}
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
            defaultModalidad={taller.modalidad_default}
            temporadasAbiertas={temporadasAbiertas}
            sesionesEstimadas={sesionesEstimadas}
            gruposPlantillaActivos={gruposPlantillaActivosList.length}
            facilitadoresOmitidosPreview={facilitadoresOmitidosPreview}
            duracionMinutos={duracionMinutos}
          />
        </div>
      )}

    </ContenedorDashboard>
  )
}
