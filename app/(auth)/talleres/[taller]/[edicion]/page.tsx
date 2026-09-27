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
 *   - editarEdicion       -> cabecera's OpenEdicionButton/CancelarEdicionButton.
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
 *   - "Cerrar esta edición" is GONE (cerrado/en_curso are now derived from
 *     the edición's own dates); CancelarEdicionButton (borrador|abierto →
 *     cancelado) replaces it.
 *   - Ventana no longer reads a `taller_periodos_generales` join (that
 *     table is deprecated, always NULL from T2 onward) — it reads the
 *     edición's OWN fecha_inicio/fecha_fin/cierre_inscripcion instead.
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { ReactElement, ReactNode } from 'react'
import { Users } from 'lucide-react'

import {
  ContenedorDashboard,
  BadgeSistema,
  TarjetaSistema,
  TextoSistema,
  TituloSistema,
} from '@/components/ui/sistema-diseno'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import { TablaInscripciones } from '@/components/talleres/tabla-inscripciones'
import { GruposSection } from '@/components/talleres/grupos-section'
import { CancelarEdicionButton, OpenEdicionButton } from '@/components/talleres/open-edicion-button'
import { cierreRelativoLabel, edicionEstadoBadgeVariante, edicionEstadoLabel } from '@/components/talleres/labels'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { loadTallerDetalle } from '@/lib/platform/talleres/catalogo'
import { loadEdicionLocalDetalle, type EdicionLocalDetalle } from '@/lib/platform/talleres/operacional'
import { loadAdminInscripciones } from '@/lib/platform/talleres/admin-inscripciones'
import { loadGruposDeCohorte, loadGruposInstanciados } from '@/lib/platform/talleres/grupo-detalle'
import { loadServidoresDelTaller } from '@/lib/platform/talleres/servidores-del-taller'
import { refrescarEstadosEdiciones } from '@/lib/platform/talleres/refrescar-estados'
import {
  approveInscripcionAction,
  rejectInscripcionAction,
} from '@/lib/platform/talleres/inscripciones-actions'
import { cargarPermisos } from '@/lib/platform/talleres/permisos'
import { rutaTaller } from '@/lib/platform/talleres/rutas'

export const metadata = { title: 'Edición' }

interface RouteContext {
  readonly params: Promise<{ readonly taller: string; readonly edicion: string }>
}

export default async function EdicionDetallePage(ctx: RouteContext) {
  if (!isTalleresEnabled()) {
    return (
      <ContenedorDashboard titulo="Edición">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">El módulo de talleres está deshabilitado.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  const { taller: tallerSlug, edicion: edicionId } = await ctx.params

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) {
    return (
      <ContenedorDashboard titulo="Edición">
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
      <ContenedorDashboard titulo="Edición">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">No se pudo resolver tu sesión.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

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

  const permisos = await cargarPermisos(client, taller.dream_team_equipo_id)
  const inscripciones = await loadAdminInscripciones(client, { edicion_id: edicion.id })

  // T3 (odd/tasks/talleres-inscripcion-a-grupo.md) — bulk-assign selector
  // options, gated on gestionarGrupos (hide, never disable — house rule).
  // Only fetched when the section will actually render.
  const grupos =
    permisos.gestionarGrupos && edicion.cohorte
      ? await loadGruposDeCohorte(client, edicion.cohorte.id)
      : []

  // T4 (odd/tasks/talleres-configuracion-del-taller.md) — GruposSection's
  // own instanciados grupos (nombre, capacidad, facilitadores) and the
  // bounded picker's servidores list, same gate as above: only fetched
  // when the section will actually render.
  const [gruposInstanciados, cargaServidoresDelTaller] =
    permisos.gestionarGrupos && edicion.cohorte
      ? await Promise.all([
          loadGruposInstanciados(client, edicion.cohorte.id),
          loadServidoresDelTaller(client, taller.id),
        ])
      : [[], { ok: true, servidores: [] } as const]

  // B2 correction (T7) — loadServidoresDelTaller now returns a
  // discriminated result (see lib/platform/talleres/servidores-del-
  // taller.ts). This picker only needs the plain list; a 42501 here
  // degrades to an empty option list, same as before — the access-state
  // distinction matters for the taller page's own Equipo section, not
  // this bulk picker.
  const servidoresDelTaller = cargaServidoresDelTaller.ok ? cargaServidoresDelTaller.servidores : []

  return (
    <ContenedorDashboard
      titulo={edicion.nombre_snapshot}
      botonRegreso={{ href: rutaTaller(taller.slug), texto: taller.nombre }}
    >
      {/* Cabecera */}
      <TarjetaSistema variante="outlined" className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <Link
              href={rutaTaller(taller.slug)}
              className="text-sm font-medium text-foreground hover:underline"
            >
              {taller.nombre}
            </Link>
            <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
              Inicio: {formatFecha(edicion.cohorte?.started_at ?? null)} · Fin:{' '}
              {formatFecha(edicion.cohorte?.ended_at ?? null)}
            </TextoSistema>
            {edicion.estado === 'borrador' && (
              // T11 (flow audit) — "Abrir esta edición" (OpenEdicionButton,
              // below) becomes the clear next step: this line names the
              // state and what to do about it.
              <TextoSistema variante="sutil" tamaño="sm" className="mt-2 block">
                Esta edición está en borrador. Revisa grupos y clases y luego ábrela para recibir
                inscripciones.
              </TextoSistema>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <BadgeSistema variante={edicionEstadoBadgeVariante(edicion.estado)}>
              {edicionEstadoLabel(edicion.estado)}
            </BadgeSistema>
            {permisos.editarEdicion && edicion.estado === 'borrador' && (
              <OpenEdicionButton edicionId={edicion.id} />
            )}
            {permisos.editarEdicion &&
              (edicion.estado === 'borrador' || edicion.estado === 'abierto') && (
                <CancelarEdicionButton
                  tallerSlug={taller.slug}
                  edicionId={edicion.id}
                  inscritos={edicion.inscripciones_count}
                />
              )}
          </div>
        </div>
      </TarjetaSistema>

      {/* Inscritos */}
      <section aria-labelledby="inscritos-heading">
        <TituloSistema nivel={2} id="inscritos-heading">
          Inscritos
        </TituloSistema>
        <div className="mt-3">
          {inscripciones.rows.length === 0 ? (
            <EstadoVacio icono={Users} titulo="No hay inscritos todavía" />
          ) : (
            <TablaInscripciones
              rows={inscripciones.rows}
              canWrite={permisos.aprobarInscripciones}
              onApprove={approveInscripcionAction}
              onReject={rejectInscripcionAction}
              seleccion={permisos.gestionarGrupos ? { grupos } : undefined}
            />
          )}
        </div>
      </section>

      {/* Grupos */}
      {permisos.gestionarGrupos && edicion.cohorte && (
        <GruposSection
          cohorteId={edicion.cohorte.id}
          tallerSlug={taller.slug}
          edicionId={edicion.id}
          grupos={gruposInstanciados}
          servidores={servidoresDelTaller}
          puedeEditar={permisos.gestionarGrupos}
        />
      )}

      {/* Ventana */}
      <section aria-labelledby="ventana-heading">
        <TituloSistema nivel={2} id="ventana-heading">
          Ventana
        </TituloSistema>
        <TarjetaSistema variante="outlined" className="mt-3 p-4">
          {edicion.fecha_inicio && edicion.fecha_fin && edicion.cierre_inscripcion ? (
            <>
              <TextoSistema>
                {resumenVentana(edicion.estado, edicion.fecha_fin, edicion.cierre_inscripcion)}
              </TextoSistema>
              {/* T11 — the detailed fields stay reachable, collapsed, only
                  for whoever could actually act on them (editarEdicion) —
                  a read-only viewer gets the one sentence above and
                  nothing more. */}
              {permisos.editarEdicion && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-foreground">Ver fechas</summary>
                  <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Campo titulo="Primera clase">{formatFecha(edicion.fecha_inicio)}</Campo>
                    <Campo titulo="Última clase">{formatFecha(edicion.fecha_fin)}</Campo>
                    <Campo titulo="Cierre de inscripción">{formatFecha(edicion.cierre_inscripcion)}</Campo>
                    <Campo titulo="Cierre relativo">
                      {cierreRelativoLabel(taller.cierre_inscripcion_offset_dias)}
                    </Campo>
                  </dl>
                </details>
              )}
            </>
          ) : (
            <TextoSistema variante="sutil">
              Esta edición no tiene fechas registradas todavía.
            </TextoSistema>
          )}
        </TarjetaSistema>
      </section>
    </ContenedorDashboard>
  )
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
 * viewer timezone — this page now shows those columns directly (Ventana),
 * not just cohorte timestamps, so the bug would otherwise become visible.
 */
function formatFecha(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('es', { timeZone: 'UTC' })
}

/**
 * T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — the Ventana
 * section collapses to ONE sentence for a viewer without editarEdicion.
 * Replaces the old periodo_general-backed version (that table is
 * deprecated, always NULL from T2 onward): reads the edición's OWN
 * fecha_fin/cierre_inscripcion, the exact columns talleres_estado_efectivo
 * derives `estado` from — quoting the SAME dates the badge above is
 * already a function of, not a separate snapshot of them.
 */
function resumenVentana(
  estado: EdicionLocalDetalle['estado'],
  fechaFin: string,
  cierreInscripcion: string,
): string {
  switch (estado) {
    case 'cancelado':
      return 'Esta edición está cancelada.'
    case 'cerrado':
      return `Cerrada el ${formatFecha(fechaFin)}.`
    case 'en_curso':
      return `En curso hasta el ${formatFecha(fechaFin)}.`
    default:
      // borrador, abierto — both already carry real dates (set at
      // creation time), so the forward-looking sentence is accurate even
      // before a borrador is opened.
      return `Inscripciones abiertas hasta el ${formatFecha(cierreInscripcion)}.`
  }
}
