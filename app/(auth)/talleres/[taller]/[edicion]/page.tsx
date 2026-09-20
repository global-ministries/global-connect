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
 *   - editarEdicion       -> cabecera's OpenEdicionButton/CloseEdicionButton.
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
 * Ventana (the taller_periodos_generales row) and the cabecera's own
 * fields have no permission gate, same as the old page's ungated
 * "Información de la edición"/"Período general" cards: visibility is
 * already decided by whether the two loaders above returned data at all
 * (RLS-scoped), matching T3's "RLS decides, the page doesn't re-branch"
 * discipline.
 *
 * Grupos rows stay non-interactive — see the `// T5` marker inside
 * GruposSection itself (components/talleres/grupos-section.tsx, moved
 * there in the same feature) — since
 * /talleres/[taller]/[edicion]/[grupo] does not exist yet.
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
} from '@/components/ui/sistema-diseno'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import { TablaInscripciones } from '@/components/talleres/tabla-inscripciones'
import { GruposSection } from '@/components/talleres/grupos-section'
import { OpenEdicionButton, CloseEdicionButton } from '@/components/talleres/open-edicion-button'
import { edicionEstadoBadgeVariante, edicionEstadoLabel } from '@/components/talleres/labels'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { loadTallerDetalle } from '@/lib/platform/talleres/catalogo'
import { loadEdicionLocalDetalle } from '@/lib/platform/talleres/operacional'
import { loadAdminInscripciones } from '@/lib/platform/talleres/admin-inscripciones'
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

  const edicion = await loadEdicionLocalDetalle(client, edicionId)
  if (!edicion || edicion.taller_slug !== taller.slug) {
    notFound()
  }

  const permisos = await cargarPermisos(client, taller.dream_team_equipo_id)
  const inscripciones = await loadAdminInscripciones(client, { edicion_id: edicion.id })

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
          </div>
          <div className="flex flex-col items-end gap-2">
            <BadgeSistema variante={edicionEstadoBadgeVariante(edicion.estado)}>
              {edicionEstadoLabel(edicion.estado)}
            </BadgeSistema>
            {permisos.editarEdicion && edicion.estado === 'borrador' && (
              <OpenEdicionButton edicionId={edicion.id} />
            )}
            {permisos.editarEdicion &&
              (edicion.estado === 'abierto' || edicion.estado === 'en_curso') && (
                <CloseEdicionButton edicionId={edicion.id} />
              )}
          </div>
        </div>
      </TarjetaSistema>

      {/* Inscritos */}
      <section aria-labelledby="inscritos-heading">
        <h2 id="inscritos-heading" className="text-lg font-semibold tracking-tight sm:text-xl">
          Inscritos
        </h2>
        <div className="mt-3">
          {inscripciones.rows.length === 0 ? (
            <EstadoVacio icono={Users} titulo="No hay inscritos todavía" />
          ) : (
            <TablaInscripciones
              rows={inscripciones.rows}
              canWrite={permisos.aprobarInscripciones}
              onApprove={approveInscripcionAction}
              onReject={rejectInscripcionAction}
            />
          )}
        </div>
      </section>

      {/* Grupos */}
      {permisos.gestionarGrupos && edicion.cohorte && (
        <GruposSection cohorteId={edicion.cohorte.id} />
      )}

      {/* Ventana */}
      <section aria-labelledby="ventana-heading">
        <h2 id="ventana-heading" className="text-lg font-semibold tracking-tight sm:text-xl">
          Ventana
        </h2>
        <TarjetaSistema variante="outlined" className="mt-3 p-4">
          {edicion.periodo_general ? (
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo titulo="Apertura automática">
                {formatFecha(edicion.periodo_general.fecha_apertura_automatica)}
              </Campo>
              <Campo titulo="Cierre automático">
                {formatFecha(edicion.periodo_general.fecha_cierre_automatica)}
              </Campo>
              <Campo titulo="Apertura manual">
                {formatFecha(edicion.periodo_general.fecha_apertura_manual)}
              </Campo>
              <Campo titulo="Cierre manual">
                {formatFecha(edicion.periodo_general.fecha_cierre_manual)}
              </Campo>
              <Campo titulo="Cierre real">
                {formatFecha(edicion.periodo_general.fecha_cierre_real)}
              </Campo>
              {edicion.periodo_general.motivo_cierre && (
                <Campo titulo="Motivo de cierre">{edicion.periodo_general.motivo_cierre}</Campo>
              )}
            </dl>
          ) : (
            <TextoSistema variante="sutil">
              No hay período general asociado (modalidad permanente custom o período aún no
              creado).
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

function formatFecha(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('es')
}
