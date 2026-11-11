/**
 * T4 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/[taller]/[edicion],
 * the edición detail screen. Replaces
 * app/(auth)/admin/talleres/edicion/[id]/page.tsx and absorbs the
 * per-edición half of app/(auth)/admin/talleres/inscripciones/page.tsx and
 * app/(auth)/talleres/coordinacion/inscripciones/page.tsx — read those
 * three pages (and their actions) for what this ports; nothing here is a
 * new feature, everything is a scoped port of an existing screen. All
 * three old pages keep working unmodified until T10 deletes them.
 *
 * `[taller]` is the taller's SLUG, `[edicion]` is the edición's own id.
 * rutas.ts's rutaEdicion(slug, edicionId) already builds this URL (used by
 * T3's catalog rows and by this page's own botonRegreso).
 *
 * GATE, same shape as /talleres/[taller]: flag -> user -> session, each an
 * informational card. Then TWO lookups that must both resolve and agree:
 *   1. loadTallerDetalle(client, slug) — notFound() if the slug is unknown.
 *   2. loadEdicionLocalDetalle(client, edicionId) — notFound() if the id is
 *      unknown OR if it resolves to an edición that belongs to a DIFFERENT
 *      taller (edicion.taller_slug !== taller.slug). A mismatched pair
 *      (a real edición id under the wrong taller slug in the URL) must
 *      404, never silently render the wrong taller's edición.
 *
 * PERMISSIONS: one cargarPermisos(client, taller.dream_team_equipo_id) call
 * for the whole page — every control below reads one of its booleans,
 * never a flat `caps.includes(...)` check (docs/talleres-de-punta-a-
 * punta.md §9, "Permisos en la interfaz").
 *
 *   - editarEdicion       -> cabecera's OpenEdicionButton/CancelarEdicionButton/
 *     CerrarEdicionButton.
 *     talleres_mis_permisos computes editar_edicion as director.write OR
 *     admin.manage — the exact same two capabilities
 *     admin/talleres/edicion/[id]/actions.ts's own requireAdminOrDirector()
 *     already required, just flat there and scoped here.
 *   - aprobarInscripciones -> TablaInscripciones's canWrite prop.
 *     TablaInscripciones already falls back to the plain estado badge when
 *     canWrite is false — no extra branching needed here.
 *   - gestionarGrupos      -> whether <GruposSection> renders at all,
 *     mirroring the old page's `hasCap && edicion.cohorte` gate, now
 *     scoped instead of flat.
 *
 * Ventana and the cabecera's own fields have no permission gate, same as
 * the old page's ungated "Información de la edición" card: visibility is
 * already decided by whether the two loaders above returned data at all
 * (RLS-scoped), matching T3's "RLS decides, the page doesn't re-branch"
 * discipline.
 *
 * Grupos rows stay non-interactive — see the `// T5` marker inside
 * GruposSection itself (components/talleres/grupos-section.tsx, moved
 * there in the same feature) — since
 * /talleres/[taller]/[edicion]/[grupo] does not exist yet.
 *
 * T4 (odd/tasks/talleres-configuracion-del-taller.md): GruposSection now
 * also receives the edición's own INSTANCIADOS grupos (loadGruposInstanciados,
 * nombre/capacidad/facilitadores) and the taller's servidores
 * (loadServidoresDelTaller, the SAME bounded picker's option list T3 built
 * for the plantilla) — both fetched only under the same gestionarGrupos +
 * cohorte gate the section's own visibility already uses, matching T3's
 * "fetch only what will actually render" discipline.
 *
 * T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6):
 *   - refrescarEstadosEdiciones(client, taller.id) runs right after the
 *     taller lookup (its id is known then) and before loadEdicionLocalDetalle,
 *     so the badge below never shows a stale STORED estado for THIS taller
 *     (best effort — see that module's own header).
 *   - The old manual "Cerrar esta edición" (a bare estado flip to cerrado)
 *     was removed: en_curso/cerrado are derived from the edición's own
 *     dates, so flipping the estado decided nothing. CancelarEdicionButton
 *     (borrador|abierto → cancelado) is the only manual estado change.
 *
 * Cierre de edición (odd/tasks/talleres-cierre-de-edicion.md T2): closing is
 * back, as a real process instead of an estado flip. CerrarEdicionButton
 * (components/talleres/cerrar-edicion-dialog.tsx) previews the close
 * (talleres_previsualizar_cierre: resultado per inscrito from attendance,
 * clases to cancel, reportes left open) and, on confirm, runs
 * talleres_cerrar_edicion: unit_estado per inscrito, certificados, grupos/
 * clases/reportes closed in one transaction, and `cerrada_en` stamped
 * (talleres_estado_efectivo then keeps it `cerrado`). It is offered with
 * editarEdicion, an estado that is neither borrador nor cancelado (a
 * date-derived `cerrado` still needs its results computed), and no
 * cerrada_en. The element stays mounted for every editarEdicion viewer and
 * only its trigger follows `puedeCerrar`, so the dialog's summary survives
 * the revalidation that stamps cerrada_en.
 *   - Ventana no longer reads a `taller_periodos_generales` join (that
 *     table is deprecated, always NULL from T2 onward) — it reads the
 *     edición's OWN fecha_inicio/fecha_fin/cierre_inscripcion instead.
 *
 * Mínimo de inscritos (odd/tasks/talleres-reserva-publica.md T8a, S9 S15
 * S16): loadPanelMinimo (talleres_minimo_panel, best effort) drives two
 * blocks above Inscritos. Below the minimum, AvisoMinimo offers «Suspender
 * y mover a nueva fecha», «Abrir igual» (only the director and the taller's
 * coordinador, decided by the RPC's puede_abrir_igual) and the existing
 * «Cancelar esta edición» (editarEdicion, now also allowed below the
 * minimum — see cancelarEdicion). After a suspension, EstadoSuspension shows
 * the answers and the call list.
 *
 * Lugar e indicaciones (odd/tasks/talleres-reserva-publica.md T10, S6): the
 * cabecera shows the edición's lugar and indicaciones (they travel in the
 * notices) to every viewer; with editarEdicion, «Lugar e indicaciones»
 * (EditarDatosPracticosEdicion) edits them while the edición is neither
 * cancelled nor closed.
 *
 * R3f (odd/tasks/talleres-rediseno.md, S1, S2, S4) — v2 layout after the
 * approved artboards design/talleres-reserva/12 (desktop) and
 * design/talleres-interior/24 (phone):
 *   - breadcrumbs «Talleres › taller › edición» (phone: «‹ taller» and the
 *     large title), the hero «taller · edición» with the estado, ONE summary
 *     line (inscritas de cupo · mínimo · por aprobar · cierre), the dates,
 *     lugar and indicaciones, and the edición's controls (Inscribir a
 *     alguien — a FAB on phones —, Abrir, Lugar e indicaciones, Cancelar,
 *     Cerrar), each under the same permiso as before;
 *   - the T8a minimum blocks, unchanged;
 *   - EdicionCliente (components/talleres/edicion/edicion-cliente.tsx): the
 *     «Inscripciones» tab (attention metrics as filters, ListaResponsiva,
 *     one DetalleInscripcion per row, selection mode) and, with
 *     gestionarGrupos and a cohorte, the «Grupos» tab (GruposSection + «Sin
 *     grupo»). It replaces the legacy TablaInscripciones. Only data and
 *     two booleans cross into it: puedeAprobar (aprobarInscripciones) and
 *     puedeAsignar (gestionarGrupos with a cohorte); the server actions,
 *     the asignar-grupo route and the RPCs check again;
 *   - «Fechas» (the old Ventana) with Reprogramar, unchanged.
 * The grupo options come from loadGruposInstanciados (with facilitadora and
 * ocupación), so loadGruposDeCohorte is no longer read here. origen and
 * por_verificar come from cargarExtrasInscripciones (best effort).
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { ReactElement, ReactNode } from 'react'
import { CalendarDays, MapPin } from 'lucide-react'

import { PaginaSistema, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { BotonAtrasMovil, TituloGrande } from '@/components/ui/barra-navegacion-movil'
import { PuntoEstado, type TonoEstado } from '@/components/ui/punto-estado'
import { GruposSection } from '@/components/talleres/grupos-section'
import { CancelarEdicionButton, OpenEdicionButton } from '@/components/talleres/open-edicion-button'
import { CerrarEdicionButton } from '@/components/talleres/cerrar-edicion-dialog'
import { ReprogramarEdicionDialog } from '@/components/talleres/reprogramar-edicion'
import { EditarDatosPracticosEdicion } from '@/components/talleres/datos-practicos-edicion'
import { AvisoMinimo } from '@/components/talleres/minimo/aviso-minimo'
import { EstadoSuspension } from '@/components/talleres/minimo/estado-suspension'
import { EdicionCliente } from '@/components/talleres/edicion/edicion-cliente'
import { InscribirAlguien } from '@/components/talleres/edicion/inscribir-alguien'
import { cargarExtrasInscripciones } from '@/components/talleres/edicion/cargar-extras'
import {
  construirInscritas,
  leerFiltros,
  leerVista,
  plural,
  type GrupoEdicionOpcion,
} from '@/components/talleres/edicion/modelo'
import { cierreRelativoLabel, edicionEstadoBadgeVariante, edicionEstadoLabel } from '@/components/talleres/labels'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { loadTallerDetalle } from '@/lib/platform/talleres/catalogo'
import {
  loadCupoEdicion,
  loadEdicionLocalDetalle,
  loadReprogramacionAudit,
  loadReprogramarPreview,
  type EdicionLocalDetalle,
} from '@/lib/platform/talleres/operacional'
import { loadAdminInscripciones } from '@/lib/platform/talleres/admin-inscripciones'
import { conEstadoAcceso } from '@/lib/platform/talleres/invitacion-acceso-estado'
import { loadGruposInstanciados, type GrupoInstanciado } from '@/lib/platform/talleres/grupo-detalle'
import { loadServidoresDelTaller } from '@/lib/platform/talleres/servidores-del-taller'
import { refrescarEstadosEdiciones } from '@/lib/platform/talleres/refrescar-estados'
import { cargarPermisos } from '@/lib/platform/talleres/permisos'
import { rutaCatalogo, rutaTaller } from '@/lib/platform/talleres/rutas'
import {
  fechaCorta,
  hoyIglesia,
  loadPanelMinimo,
  mostrarEstadoSuspension,
} from '@/lib/platform/talleres/minimo-suspension'

export const metadata = { title: 'Edición' }

type Params = Record<string, string | string[] | undefined>

interface RouteContext {
  readonly params: Promise<{ readonly taller: string; readonly edicion: string }>
  readonly searchParams?: Promise<Params>
}

function primero(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor
}

/** The gate's informational card. */
function aviso(texto: string): ReactElement {
  return (
    <PaginaSistema titulo="Edición">
      <TarjetaSistema variante="outlined" className="p-6 text-center">
        <TextoSistema variante="sutil">{texto}</TextoSistema>
      </TarjetaSistema>
    </PaginaSistema>
  )
}

export default async function EdicionDetallePage(ctx: RouteContext) {
  if (!isTalleresEnabled()) return aviso('El módulo de talleres está deshabilitado.')

  const { taller: tallerSlug, edicion: edicionId } = await ctx.params

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) return aviso('Necesitas iniciar sesión.')

  const session = await resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) => findPlatformSessionPersonaByAuthId(supabase, authId),
    capabilitySupabase: supabase,
  })
  if (!session) return aviso('No se pudo resolver tu sesión.')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase

  const taller = await loadTallerDetalle(client, tallerSlug)
  if (!taller) {
    notFound()
  }

  // T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — best
  // effort, scoped to THIS taller (its id is known now, unlike the taller
  // page's own unscoped call) so the edición estado read right below is
  // never stale.
  await refrescarEstadosEdiciones(client, taller.id)

  const edicion = await loadEdicionLocalDetalle(client, edicionId)
  if (!edicion || edicion.taller_slug !== taller.slug) {
    notFound()
  }

  const params: Params = (await ctx.searchParams) ?? {}
  const permisos = await cargarPermisos(client, taller.dream_team_equipo_id)
  const inscripciones = await loadAdminInscripciones(client, { edicion_id: edicion.id })
  // Access status for the inscriptions whose partner ficha the member created.
  const filasInscripciones = await conEstadoAcceso(inscripciones.rows)
  // R3f — origen and por_verificar (best effort: an empty map hides them).
  const extras = await cargarExtrasInscripciones(
    client,
    filasInscripciones.map((r) => r.id),
  )
  const inscritas = construirInscritas(filasInscripciones, extras)
  // T6 — best effort: a failed/unauthorized call just hides the cupo part.
  const cupo = await loadCupoEdicion(client, edicion.id)
  // T8a — best effort: null hides both minimum blocks.
  const panelMinimo = await loadPanelMinimo(client, edicion.id)

  // T7b — the "Reprogramar" dialog's own preview inputs and the audit line,
  // both gated on editarEdicion since only they can act on either.
  const [reprogramarPreview, reprogramacionAudit] = permisos.editarEdicion
    ? await Promise.all([
        loadReprogramarPreview(client, edicion.id),
        loadReprogramacionAudit(client, edicion.id),
      ])
    : [{ clasesPendientes: 0, primeraClaseCerrada: false }, null]

  // T4 (odd/tasks/talleres-configuracion-del-taller.md) — the instanciados
  // grupos (nombre, capacidad, ocupación, facilitadores) and the picker's
  // servidores, only fetched when the Grupos tab will render (hide, never
  // disable). R3f: the same list feeds the drawer's and the bulk bar's
  // grupo select.
  const puedeAsignar = permisos.gestionarGrupos && edicion.cohorte !== null
  const [gruposInstanciados, cargaServidoresDelTaller] = puedeAsignar && edicion.cohorte
    ? await Promise.all([
        loadGruposInstanciados(client, edicion.cohorte.id),
        loadServidoresDelTaller(client, taller.id),
      ])
    : [[] as readonly GrupoInstanciado[], { ok: true, servidores: [] } as const]

  // B2 correction (T7) — a 42501 degrades to an empty option list.
  const servidoresDelTaller = cargaServidoresDelTaller.ok ? cargaServidoresDelTaller.servidores : []
  const grupos = gruposInstanciados.map(opcionGrupo)

  // T10 — nothing is sent for a cancelled or closed edición any more.
  const puedeEditarDatosPracticos =
    permisos.editarEdicion && edicion.estado !== 'cancelado' && edicion.cerrada_en === null
  const puedeInscribir = permisos.aprobarInscripciones && edicion.cohorte !== null
  const porAprobar = inscritas.filter((i) => i.estado === 'pendiente').length
  const tituloHero = `${taller.nombre} · ${edicion.nombre_snapshot}`

  const resumen = resumenEdicion({
    edicion,
    cupo,
    minimo: panelMinimo?.minimo ?? null,
    aprobados: panelMinimo?.conteo.aprobados ?? inscritas.filter((i) => i.estado === 'aprobado').length,
    activas: inscritas.filter((i) => i.estado === 'pendiente' || i.estado === 'aprobado').length,
    porAprobar,
  })

  const estado = (
    <PuntoEstado tono={tonoEstadoEdicion(edicion.estado)} etiqueta={edicionEstadoLabel(edicion.estado)} />
  )

  const controles = (
    <div className="flex min-w-0 flex-wrap items-center gap-2 md:justify-end">
      {puedeInscribir && edicion.cohorte && (
        <InscribirAlguien
          tallerSlug={taller.slug}
          edicionId={edicion.id}
          cohorteId={edicion.cohorte.id}
          tipo={edicion.tipo}
        />
      )}
      {permisos.editarEdicion && edicion.estado === 'borrador' && <OpenEdicionButton edicionId={edicion.id} />}
      {puedeEditarDatosPracticos && (
        <EditarDatosPracticosEdicion
          tallerSlug={taller.slug}
          edicionId={edicion.id}
          lugar={edicion.lugar}
          indicaciones={edicion.indicaciones}
        />
      )}
      {permisos.editarEdicion && (edicion.estado === 'borrador' || edicion.estado === 'abierto') && (
        <CancelarEdicionButton
          tallerSlug={taller.slug}
          edicionId={edicion.id}
          inscritos={edicion.inscripciones_count}
        />
      )}
      {permisos.editarEdicion && (
        <CerrarEdicionButton
          tallerSlug={taller.slug}
          edicionId={edicion.id}
          puedeCerrar={
            edicion.cerrada_en === null && edicion.estado !== 'borrador' && edicion.estado !== 'cancelado'
          }
        />
      )}
    </div>
  )

  return (
    // No `titulo`: the h1 is the hero on desktop and the large title on phones (one h1 per width).
    <PaginaSistema
      breadcrumbs={<Migas tallerSlug={taller.slug} tallerNombre={taller.nombre} edicionNombre={edicion.nombre_snapshot} />}
      className="pb-28 md:pb-0"
    >
      {/* Hero */}
      <header className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="min-w-0">
          <div className="md:hidden">
            <BotonAtrasMovil atras={{ etiqueta: taller.nombre, href: rutaTaller(taller.slug) }} className="-ml-2 mb-1 max-w-[70%]" />
            <p className="flex min-w-0 flex-wrap items-center gap-2 px-1 text-[13px] text-muted-foreground">
              <span className="truncate">{taller.nombre}</span>
              {estado}
            </p>
            <TituloGrande titulo={edicion.nombre_snapshot} nivel={2} resumen={resumen} />
          </div>
          <div className="hidden min-w-0 md:block">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="min-w-0 text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground">{tituloHero}</h1>
              {estado}
            </div>
            <p className="mt-1.5 text-[15px] text-muted-foreground [&_strong]:text-foreground">{resumen}</p>
          </div>

          <div className="mt-3 grid min-w-0 gap-2 px-1 text-sm text-muted-foreground md:px-0">
            {(edicion.fecha_inicio || edicion.lugar) && (
              <p className="flex min-w-0 flex-wrap gap-x-4 gap-y-1">
                {edicion.fecha_inicio && edicion.fecha_fin && (
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
                    {`${formatFecha(edicion.fecha_inicio)} al ${formatFecha(edicion.fecha_fin)}`}
                  </span>
                )}
                {edicion.lugar && (
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                    <span className="sr-only">Lugar: </span>
                    <span className="min-w-0 break-words text-foreground">{edicion.lugar}</span>
                  </span>
                )}
              </p>
            )}
            {edicion.indicaciones && (
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.08em]">Indicaciones para los participantes</p>
                <p className="mt-0.5 whitespace-pre-line break-words text-foreground">{edicion.indicaciones}</p>
              </div>
            )}
            {puedeEditarDatosPracticos && !edicion.lugar && !edicion.indicaciones && (
              <p>Sin lugar ni indicaciones: los avisos solo dirán la fecha y la hora.</p>
            )}
            {edicion.cerrada_en && <p>Cerrada el {formatFechaHora(edicion.cerrada_en)}</p>}
            {edicion.estado === 'borrador' && (
              // T11 (flow audit) — "Abrir esta edición" becomes the clear next step.
              <p className="text-foreground">
                Esta edición está en borrador. Revisa grupos y clases y luego ábrela para recibir inscripciones.
              </p>
            )}
          </div>
        </div>
        {controles}
      </header>

      {/* Mínimo de inscritos (T8a) */}
      {panelMinimo?.bajoMinimo && (
        <AvisoMinimo
          tallerSlug={taller.slug}
          tallerNombre={taller.nombre}
          edicionId={edicion.id}
          panel={panelMinimo}
          cancelar={
            permisos.editarEdicion ? (
              <CancelarEdicionButton
                tallerSlug={taller.slug}
                edicionId={edicion.id}
                inscritos={edicion.inscripciones_count}
              />
            ) : undefined
          }
        />
      )}
      {panelMinimo && mostrarEstadoSuspension(panelMinimo, hoyIglesia()) && (
        <EstadoSuspension
          tallerSlug={taller.slug}
          tallerNombre={taller.nombre}
          edicionId={edicion.id}
          panel={panelMinimo}
        />
      )}

      <EdicionCliente
        inscritas={inscritas}
        grupos={grupos}
        puedeAprobar={permisos.aprobarInscripciones}
        puedeAsignar={puedeAsignar}
        mostrarResultado={edicion.cerrada_en !== null}
        vistaInicial={leerVista(primero(params.vista))}
        filtrosIniciales={leerFiltros({
          atencion: primero(params.atencion),
          origen: primero(params.origen),
          q: primero(params.q),
        })}
        itemInicial={primero(params.item) ?? null}
        panelGrupos={
          puedeAsignar && edicion.cohorte ? (
            <GruposSection
              cohorteId={edicion.cohorte.id}
              tallerSlug={taller.slug}
              edicionId={edicion.id}
              grupos={gruposInstanciados}
              servidores={servidoresDelTaller}
              puedeEditar={permisos.gestionarGrupos}
            />
          ) : null
        }
      />

      {/* Fechas (the old «Ventana») */}
      <section aria-labelledby="ventana-heading" className="grid min-w-0 gap-3">
        <h2 id="ventana-heading" className="px-1 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground md:px-0">
          Fechas
        </h2>
        <TarjetaSistema variante="outlined" className="p-4">
          {edicion.fecha_inicio && edicion.fecha_fin && edicion.cierre_inscripcion ? (
            <>
              <TextoSistema>
                {resumenVentana(edicion.estado, edicion.fecha_fin, edicion.cierre_inscripcion, edicion.cerrada_en)}
              </TextoSistema>
              {/* T11 — the detailed fields stay reachable, collapsed, only
                  for whoever could act on them (editarEdicion). */}
              {permisos.editarEdicion && (
                <details className="mt-3">
                  <summary className="focus-ring min-h-11 cursor-pointer rounded-md py-2 text-sm font-medium text-foreground">
                    Ver fechas
                  </summary>
                  <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Campo titulo="Primera clase">{formatFecha(edicion.fecha_inicio)}</Campo>
                    <Campo titulo="Última clase">{formatFecha(edicion.fecha_fin)}</Campo>
                    <Campo titulo="Cierre de inscripción">{formatFecha(edicion.cierre_inscripcion)}</Campo>
                    <Campo titulo="Cierre relativo">{cierreRelativoLabel(taller.cierre_inscripcion_offset_dias)}</Campo>
                  </dl>
                  {/* T7b — nothing left to reprogramar once cerrada/cancelada. */}
                  {edicion.estado !== 'cerrado' && edicion.estado !== 'cancelado' && (
                    <div className="mt-3">
                      <ReprogramarEdicionDialog
                        tallerSlug={taller.slug}
                        edicionId={edicion.id}
                        fechaInicio={edicion.fecha_inicio}
                        fechaFin={edicion.fecha_fin}
                        cierreInscripcion={edicion.cierre_inscripcion}
                        clasesPendientes={reprogramarPreview.clasesPendientes}
                        primeraClaseCerrada={reprogramarPreview.primeraClaseCerrada}
                      />
                    </div>
                  )}
                  {reprogramacionAudit && (
                    <TextoSistema variante="sutil" tamaño="sm" className="mt-3 block">
                      {`Reprogramada por ${reprogramacionAudit.nombre} ${reprogramacionAudit.apellido} el ${formatFecha(reprogramacionAudit.en)}${reprogramacionAudit.motivo ? `: ${reprogramacionAudit.motivo}` : ''}`}
                    </TextoSistema>
                  )}
                </details>
              )}
            </>
          ) : (
            <TextoSistema variante="sutil">Esta edición no tiene fechas registradas todavía.</TextoSistema>
          )}
        </TarjetaSistema>
      </section>
    </PaginaSistema>
  )
}

function Migas({
  tallerSlug,
  tallerNombre,
  edicionNombre,
}: {
  readonly tallerSlug: string
  readonly tallerNombre: string
  readonly edicionNombre: string
}): ReactElement {
  const separador = (
    <span aria-hidden="true" className="px-0.5 text-muted-foreground/60">
      /
    </span>
  )
  return (
    <nav aria-label="Ubicación">
      <ol className="flex min-w-0 flex-wrap items-center gap-0.5 text-sm">
        <li className="flex min-w-0 items-center">
          <Link href={rutaCatalogo()} className="focus-ring truncate rounded-md px-2 py-1.5 text-muted-foreground hover:text-foreground">
            Talleres
          </Link>
        </li>
        <li className="flex min-w-0 items-center gap-0.5">
          {separador}
          <Link href={rutaTaller(tallerSlug)} className="focus-ring truncate rounded-md px-2 py-1.5 text-muted-foreground hover:text-foreground">
            {tallerNombre}
          </Link>
        </li>
        <li className="flex min-w-0 items-center gap-0.5">
          {separador}
          <span aria-current="page" className="truncate px-2 py-1.5 font-semibold text-foreground">
            {edicionNombre}
          </span>
        </li>
      </ol>
    </nav>
  )
}

function Num({ children }: { readonly children: number }): ReactElement {
  return <strong className="font-mono font-semibold tabular-nums">{children}</strong>
}

function opcionGrupo(g: GrupoInstanciado): GrupoEdicionOpcion {
  const lider = g.facilitadores.find((f) => f.rol === 'lider') ?? g.facilitadores[0] ?? null
  const facilitadora = lider ? [lider.nombre, lider.apellido].filter(Boolean).join(' ') || null : null
  return { id: g.id, nombre: g.nombre, facilitadora, ocupacion: g.ocupacion, capacidad: g.capacidad }
}

function tonoEstadoEdicion(estado: string): TonoEstado {
  switch (edicionEstadoBadgeVariante(estado)) {
    case 'success':
      return 'success'
    case 'info':
      return 'info'
    case 'warning':
      return 'warning'
    case 'error':
      return 'danger'
    default:
      return 'muted'
  }
}

interface DatosResumen {
  readonly edicion: EdicionLocalDetalle
  readonly cupo: Awaited<ReturnType<typeof loadCupoEdicion>>
  readonly minimo: number | null
  readonly aprobados: number
  /** Pendientes + aprobadas, when the cupo cannot be read. */
  readonly activas: number
  readonly porAprobar: number
}

/**
 * The hero's ONE summary line: «14 inscritas de 30 · mínimo 10 alcanzado ·
 * 5 por aprobar · la inscripción cierra el vie 20 nov». Each part only when
 * its data is there.
 */
function resumenEdicion({ edicion, cupo, minimo, aprobados, activas, porAprobar }: DatosResumen): ReactNode {
  const partes: ReactNode[] = []
  if (cupo && cupo.cupo > 0) {
    const unidad = cupo.unidad === 'parejas' ? plural(cupo.ocupados, 'pareja', 'parejas') : plural(cupo.ocupados, 'inscrita', 'inscritas')
    partes.push(
      <span key="cupo">
        <Num>{cupo.ocupados}</Num> {unidad} de <span className="font-mono tabular-nums">{cupo.cupo}</span>
        {cupo.sobreCupo > 0 && (
          <span className="font-medium text-warning-text">
            {' '}
            (<span className="font-mono tabular-nums">{cupo.sobreCupo}</span> sobre el cupo)
          </span>
        )}
      </span>,
    )
  } else {
    partes.push(
      <span key="cupo">
        <Num>{cupo ? cupo.ocupados : activas}</Num> {plural(cupo ? cupo.ocupados : activas, 'inscrita', 'inscritas')}
        {cupo && ' · sin cupo definido'}
      </span>,
    )
  }
  if (minimo !== null && minimo > 0) {
    partes.push(
      <span key="minimo">
        mínimo <span className="font-mono tabular-nums">{minimo}</span>
        {aprobados >= minimo && <span className="font-medium text-success-text"> alcanzado</span>}
      </span>,
    )
  }
  if (porAprobar > 0) {
    partes.push(
      <span key="aprobar">
        <Num>{porAprobar}</Num> por aprobar
      </span>,
    )
  }
  if ((edicion.estado === 'abierto' || edicion.estado === 'borrador') && edicion.cierre_inscripcion) {
    partes.push(
      <span key="cierre">
        la inscripción cierra el <strong>{fechaCorta(edicion.cierre_inscripcion)}</strong>
      </span>,
    )
  } else if (edicion.estado === 'en_curso' && edicion.fecha_fin) {
    partes.push(<span key="cierre">en curso hasta el {fechaCorta(edicion.fecha_fin)}</span>)
  }
  return partes.flatMap((parte, i) => (i === 0 ? [parte] : [<span key={`sep-${i}`}> · </span>, parte]))
}

function Campo({ titulo, children }: { readonly titulo: string; readonly children: ReactNode }): ReactElement {
  return (
    <div>
      <TextoSistema variante="sutil" tamaño="sm" className="block uppercase tracking-wide">
        {titulo}
      </TextoSistema>
      <TextoSistema className="mt-1 block">{children}</TextoSistema>
    </div>
  )
}

/**
 * T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — `timeZone:
 * 'UTC'` avoids the day-off-by-one a plain `new Date(value)` +
 * `toLocaleDateString` has for a DATE-only value (fecha_inicio/fecha_fin/
 * cierre_inscripcion are `date`, not `timestamptz`) in a negative-UTC-offset
 * viewer timezone.
 */
function formatFecha(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('es', { timeZone: 'UTC' })
}

/**
 * Cierre de edición (odd/tasks/talleres-cierre-de-edicion.md T2) —
 * `cerrada_en` is a timestamptz, read in the church's time zone: the same
 * America/Caracas fallback talleres_hoy() uses to decide "today".
 */
const ZONA_HORARIA_IGLESIA = 'America/Caracas'

function formatFechaHora(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('es', { timeZone: ZONA_HORARIA_IGLESIA })
}

/**
 * T4 — the Fechas section's one sentence, from the edición's OWN
 * fecha_fin/cierre_inscripcion (the columns talleres_estado_efectivo derives
 * `estado` from). An edición a director actually closed quotes its
 * `cerrada_en`, the same date the hero shows.
 */
function resumenVentana(
  estado: EdicionLocalDetalle['estado'],
  fechaFin: string,
  cierreInscripcion: string,
  cerradaEn: string | null,
): string {
  switch (estado) {
    case 'cancelado':
      return 'Esta edición está cancelada.'
    case 'cerrado':
      return cerradaEn ? `Cerrada el ${formatFechaHora(cerradaEn)}.` : `Cerrada el ${formatFecha(fechaFin)}.`
    case 'en_curso':
      return `En curso hasta el ${formatFecha(fechaFin)}.`
    default:
      // borrador, abierto — both already carry real dates.
      return `Inscripciones abiertas hasta el ${formatFecha(cierreInscripcion)}.`
  }
}
