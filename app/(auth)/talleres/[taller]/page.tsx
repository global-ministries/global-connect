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
 *
 * T6 (odd/tasks/talleres-reserva-publica.md, S2 S18) — "Compartir" (the
 * public link, QR and embed code, ./compartir) is one secondary action,
 * shown only with editarTaller, the same predicate that page checks.
 *
 * T9 (same doc, S8) — "Avisos" (the notices center, ./avisos) sits next to
 * Compartir with the same editarTaller gate; the avisos page and its RPC
 * still check their own authority.
 *
 * R3d (odd/tasks/talleres-rediseno.md, S1, S2, S4) — rebuilt on the v2
 * anatomy of artboard design/talleres-interior/22 (approved in L6), with the
 * same gate, loads and permission checks as above:
 *   - header actions Compartir · Avisos · Configuración (editarTaller;
 *     Configuración jumps to #configuracion-heading on this page) and the
 *     primary «Abrir edición» (abrirEdicion), which opens the existing
 *     OpenEdicionForm in a DetalleResponsivo (components/talleres/taller/
 *     abrir-edicion.tsx); on phones the same actions sit under the title;
 *   - under the title: estado, one summary line with the ediciones by
 *     estado, the org-chart path, tipo and régimen, and the descripción;
 *   - main column: Ediciones (id="ediciones", the catálogo's and the
 *     checklist's anchor) as a ListaResponsiva split Abiertas · En curso ·
 *     Cerradas (components/talleres/taller/ediciones-taller.tsx), then the
 *     plantilla de grupos;
 *   - side column: «Pasos para abrir una edición» (editarTaller), plantilla
 *     de clases, Equipo (coordinación first, facilitadores of the plantilla
 *     grupos) and Página pública (talleres.publico, read-only; one extra
 *     select by id, the same one /compartir does — hidden if it fails);
 *   - Configuración (ConfiguracionTaller, id="configuracion-heading") below,
 *     full width.
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Bell, Settings, Share2 } from 'lucide-react'

import {
  PaginaSistema,
  BadgeSistema,
  BotonSistema,
  TarjetaSistema,
  TextoSistema,
  TituloSistema,
} from '@/components/ui/sistema-diseno'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { EditarNombreTaller } from '@/components/talleres/editar-nombre-taller'
import { EditarDescripcionTaller } from '@/components/talleres/editar-descripcion-taller'
import { ConfiguracionTaller } from '@/components/talleres/configuracion-taller'
import { PlantillaClasesSection } from '@/components/talleres/plantilla-clases-section'
import { PlantillaGruposSection } from '@/components/talleres/plantilla-grupos-section'
import { AbrirEdicionProvider, BotonAbrirEdicion } from '@/components/talleres/taller/abrir-edicion'
import { EdicionesTaller } from '@/components/talleres/taller/ediciones-taller'
import { EquipoTaller, PaginaPublicaTaller, PasosAbrirEdicion } from '@/components/talleres/taller/partes-taller'
import { plural, resumenEdiciones } from '@/components/talleres/taller/vista-taller'
import { regimenLabel, tallerEstadoLabel, tipoTallerLabel } from '@/components/talleres/labels'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { loadTallerDetalle } from '@/lib/platform/talleres/catalogo'
import { cargarPermisos } from '@/lib/platform/talleres/permisos'
import { fetchRutaEquipo } from '@/lib/platform/talleres/equipo-organigrama'
import { loadServidoresDelTaller } from '@/lib/platform/talleres/servidores-del-taller'
import {
  loadPlantillaClases,
  loadPlantillaGrupos,
  previewFacilitadoresOmitidos,
} from '@/lib/platform/talleres/plantilla'
import { loadTemporadasAbiertas } from '@/lib/platform/talleres/temporadas'
import { refrescarEstadosEdiciones } from '@/lib/platform/talleres/refrescar-estados'
import { rutaCatalogo, rutaTaller } from '@/lib/platform/talleres/rutas'
import { hasDreamTeamReadCapability } from '@/lib/platform/dream-team/capabilities'

const RUTA_SERVIDORES = '/admin/dream-team/servidores'

export const metadata = { title: 'Taller' }

interface RouteContext {
  readonly params: Promise<{ readonly taller: string }>
  readonly searchParams: Promise<{ readonly creadas?: string }>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
type ClienteServidor = any

/**
 * talleres.publico, the same select by id /compartir does. `null` when it
 * cannot be read: the «Página pública» section then stays hidden instead of
 * claiming a state it does not know.
 */
async function leerPublico(client: ClienteServidor, tallerId: string): Promise<boolean | null> {
  try {
    const { data, error } = await client.from('talleres').select('publico').eq('id', tallerId).maybeSingle()
    if (error || !data) return null
    return (data as { publico?: unknown }).publico === true
  } catch {
    return null
  }
}

function Num({ children }: { readonly children: number }) {
  return <strong className="font-mono font-semibold tabular-nums text-foreground">{children}</strong>
}

export default async function TallerDetallePage(ctx: RouteContext) {
  if (!isTalleresEnabled()) {
    return (
      <PaginaSistema titulo="Talleres">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">El módulo de talleres está deshabilitado.</TextoSistema>
        </TarjetaSistema>
      </PaginaSistema>
    )
  }

  const { taller: slug } = await ctx.params
  const { creadas } = await ctx.searchParams

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) {
    return (
      <PaginaSistema titulo="Talleres">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">Necesitas iniciar sesión.</TextoSistema>
        </TarjetaSistema>
      </PaginaSistema>
    )
  }

  const session = await resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) => findPlatformSessionPersonaByAuthId(supabase, authId),
    capabilitySupabase: supabase,
  })
  if (!session) {
    return (
      <PaginaSistema titulo="Talleres">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">No se pudo resolver tu sesión.</TextoSistema>
        </TarjetaSistema>
      </PaginaSistema>
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

  const [rutaEquipo, temporadasAbiertas, cargaServidores, plantillaClases, plantillaGrupos, publico] = await Promise.all([
    equipoId ? fetchRutaEquipo(client, equipoId) : Promise.resolve(null),
    debeCargarTemporadas ? loadTemporadasAbiertas(client, taller.id) : Promise.resolve([]),
    equipoId ? loadServidoresDelTaller(client, taller.id) : Promise.resolve({ ok: true, servidores: [] } as const),
    loadPlantillaClases(client, taller.id),
    loadPlantillaGrupos(client, taller.id),
    leerPublico(client, taller.id),
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

  const rutaBase = rutaTaller(taller.slug)
  const resumen = resumenEdiciones(taller.ediciones)
  const puedeVerDreamTeam = hasDreamTeamReadCapability(session)

  // Artboard 22 order: Compartir · Avisos · Configuración, then the primary «Abrir edición».
  const accionesTaller = (className: string, claseBoton?: string) => (
    <div className={className}>
      {permisos.editarTaller && (
        <>
          <BotonSistema asChild variante="outline" tamaño="sm" icono={Share2} className={claseBoton}>
            <Link href={`${rutaBase}/compartir`}>Compartir</Link>
          </BotonSistema>
          <BotonSistema asChild variante="outline" tamaño="sm" icono={Bell} className={claseBoton}>
            <Link href={`${rutaBase}/avisos`}>Avisos</Link>
          </BotonSistema>
          <BotonSistema asChild variante="outline" tamaño="sm" icono={Settings} className={claseBoton}>
            <Link href="#configuracion-heading">Configuración</Link>
          </BotonSistema>
        </>
      )}
      <BotonAbrirEdicion className={claseBoton} />
    </div>
  )
  const hayAcciones = permisos.editarTaller || permisos.abrirEdicion

  const textoResumen =
    taller.ediciones.length === 0 ? (
      'Todavía sin ediciones'
    ) : (
      <>
        <Num>{resumen.abiertas}</Num>{' '}
        {plural(resumen.abiertas, 'edición con inscripción abierta', 'ediciones con inscripción abierta')} ·{' '}
        <Num>{resumen.enCurso}</Num> en curso · <Num>{resumen.cerradas}</Num>{' '}
        {plural(resumen.cerradas, 'cerrada', 'cerradas')}
      </>
    )

  const pagina = (
    <PaginaSistema
      titulo={taller.nombre}
      regreso={{ href: rutaCatalogo(), texto: 'Talleres' }}
      acciones={hayAcciones ? accionesTaller('flex items-center gap-2') : undefined}
    >
      <section aria-label="Resumen del taller" className="grid min-w-0 gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <div className="min-w-0 flex-1">
            {permisos.editarTaller ? (
              <EditarNombreTaller tallerId={taller.id} tallerSlug={taller.slug} nombre={taller.nombre} />
            ) : (
              // T10 (design audit) — the page's own <h1> already comes
              // from PaginaSistema (DesktopHeader); this nombre is
              // a level-2 heading, never a duplicate h1, and the slug is
              // gone (it was only ever an internal identifier).
              <TituloSistema nivel={2}>{taller.nombre}</TituloSistema>
            )}
          </div>
          <PuntoEstado tono={taller.estado === 'active' ? 'success' : 'muted'} etiqueta={tallerEstadoLabel(taller.estado)} />
        </div>
        <p className="text-[15px] text-muted-foreground">{textoResumen}</p>
        <p className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
          {rutaEquipo && (
            // T11 (flow audit) — taller -> node: a link back to the
            // org chart when the viewer can actually see it (same
            // hasDreamTeamReadCapability gate as "Gestionar en
            // Servidores"), plain text otherwise — a link that
            // 404s is worse than no link.
            <span className="min-w-0">
              {puedeVerDreamTeam ? (
                <Link href="/admin/dream-team/estructura" className="focus-ring rounded-sm hover:underline">
                  {rutaEquipo}
                </Link>
              ) : (
                rutaEquipo
              )}
            </span>
          )}
          <span>{tipoTallerLabel(taller.tipo)}</span>
          <span>{regimenLabel(taller.regimen)}</span>
        </p>
        {permisos.editarTaller ? (
          <EditarDescripcionTaller tallerId={taller.id} tallerSlug={taller.slug} descripcion={taller.descripcion} />
        ) : (
          taller.descripcion && <TextoSistema className="block max-w-3xl">{taller.descripcion}</TextoSistema>
        )}
        {/* Phones have no desktop header: the same actions live here. */}
        {hayAcciones && accionesTaller('mt-2 grid grid-cols-2 gap-2 md:hidden', 'w-full')}
      </section>

      {/* T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) —
          redirected here from OpenEdicionForm after "crear también las
          próximas" creates more than one edición at once. */}
      {creadas && Number(creadas) > 0 && (
        <BadgeSistema variante="success" role="status">
          {`Se crearon ${creadas} ediciones`}
        </BadgeSistema>
      )}

      <div className="grid min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
        <div className="grid min-w-0 gap-8">
          {/* id="ediciones": the anchor of the catálogo's «Abrir edición» and of the checklist. */}
          <section aria-labelledby="ediciones-heading" id="ediciones" className="scroll-mt-24">
            <EdicionesTaller tallerSlug={taller.slug} tallerNombre={taller.nombre} ediciones={taller.ediciones} />
          </section>

          <PlantillaGruposSection
            tallerId={taller.id}
            tallerSlug={taller.slug}
            grupos={plantillaGrupos}
            servidores={servidores}
            puedeEditar={permisos.editarTaller}
          />
        </div>

        <aside aria-label="Plantilla, equipo y página pública" className="grid min-w-0 gap-8">
          {/* T11 (flow audit) — what's left before «Abrir edición» makes
              sense. Only for editarTaller, the capacity that gates the
              plantilla edit controls. */}
          {permisos.editarTaller && (
            <PasosAbrirEdicion
              pasos={[
                { etiqueta: 'Equipo del nodo', listo: servidores.length > 0 },
                { etiqueta: 'Plantilla de clases', listo: clasesActivas > 0 },
                { etiqueta: 'Plantilla de grupos', listo: gruposPlantillaActivosList.length > 0 },
              ]}
              // T4 — the checklist's own final step names the ONE question
              // «Abrir edición» will actually ask, by régimen.
              textoFinal={
                taller.regimen === 'cadencia' ? 'Crear edición (primera clase)' : 'Crear edición (elige la temporada)'
              }
            />
          )}

          <PlantillaClasesSection
            tallerId={taller.id}
            tallerSlug={taller.slug}
            clases={plantillaClases}
            puedeEditar={permisos.editarTaller}
          />

          <EquipoTaller
            servidores={servidores}
            sinAutoridad={sinAutoridadEquipo}
            grupos={plantillaGrupos}
            enlaceServidores={puedeGestionarServidores ? `${RUTA_SERVIDORES}?equipo=${equipoId}` : null}
          />

          {publico !== null && (
            <PaginaPublicaTaller
              slug={taller.slug}
              publico={publico}
              enlaceCompartir={permisos.editarTaller ? `${rutaBase}/compartir` : null}
            />
          )}
        </aside>
      </div>

      <TarjetaSistema className="scroll-mt-24 p-4 sm:p-6" id="configuracion">
        <ConfiguracionTaller
          tallerId={taller.id}
          tallerSlug={taller.slug}
          tipo={taller.tipo}
          vinculo={taller.vinculo}
          regimen={taller.regimen}
          cierreInscripcionOffsetDias={taller.cierre_inscripcion_offset_dias}
          intervaloEdicionesDias={taller.intervalo_ediciones_dias}
          anclaEdiciones={taller.ancla_ediciones ?? null}
          clasesMinimasParaCompletar={taller.clases_minimas_para_completar}
          minimoInscritos={taller.minimo_inscritos ?? null}
          permiteRecuperarClases={taller.permite_recuperar_clases ?? true}
          momentoEnvioAcceso={taller.momento_envio_acceso}
          inscripcionAutomatica={taller.inscripcion_automatica}
          cadenciaDias={taller.cadencia_dias}
          duracionMinutos={taller.duracion_minutos}
          puedeEditar={permisos.editarTaller}
        />
      </TarjetaSistema>
    </PaginaSistema>
  )

  if (!permisos.abrirEdicion) return pagina

  return (
    <AbrirEdicionProvider
      formulario={{
        tallerId: taller.id,
        tallerSlug: taller.slug,
        tallerNombre: taller.nombre,
        regimen: taller.regimen,
        temporadasDisponibles,
        intervaloEdicionesDias: taller.intervalo_ediciones_dias,
        anclaEdiciones: taller.ancla_ediciones ?? null,
        cadenciaDias: taller.cadencia_dias,
        cierreInscripcionOffsetDias: taller.cierre_inscripcion_offset_dias,
        clasesPorGrupo,
        gruposPlantillaActivos: gruposPlantillaActivosList.length,
        facilitadoresOmitidosPreview,
      }}
    >
      {pagina}
    </AbrirEdicionProvider>
  )
}
