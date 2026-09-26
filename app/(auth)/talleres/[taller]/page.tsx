/**
 * T3 (odd/tasks/talleres-configuracion-del-taller.md) — /talleres/[taller]
 * redesigned to the system pattern: cabecera (nombre editable in place
 * through editar_taller, ruta del organigrama, estado), Equipo (the
 * node's real active servidores read from talleres_servidores_del_taller
 * — "Asignar coordinador" is gone, superseded by Dream Team → Servidores),
 * Clases/Grupos (plantilla, editable in place — PlantillaClasesSection/
 * PlantillaGruposSection) and Ediciones.
 *
 * Originally built as T3 of odd/tasks/talleres-consolidar-pantallas.md
 * (see git history for that version, which rendered OpenEdicionForm and
 * AssignServicioForm side by side). AssignServicioForm — and its backing
 * server action, `assignServicio` in app/(auth)/admin/talleres/abstracto/
 * [slug]/actions.ts — duplicated Dream Team → Servidores (docs/talleres-
 * de-punta-a-punta.md §12: "tiene un 'Asignar coordinador' que duplica a
 * Dream Team → Servidores (dos verdades)"); both are deleted, not merely
 * unused (verified via rg: assignServicio had no other caller). The
 * `fetchCoordinadorRoles` helper (lib/platform/talleres/equipo-
 * organigrama.ts) that fed it is left in place — it is independently
 * unit-tested and harmless unused, and deleting it was out of this
 * task's explicit scope.
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
 * `editarTaller` gates the cabecera's nombre edit AND the plantilla edit
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
import { Layers, Users } from 'lucide-react'

import {
  ContenedorDashboard,
  BadgeSistema,
  TarjetaSistema,
  TextoSistema,
  TituloSistema,
} from '@/components/ui/sistema-diseno'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import { OpenEdicionForm } from '@/components/talleres/open-edicion-form'
import { EditarNombreTaller } from '@/components/talleres/editar-nombre-taller'
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
import { loadPlantillaClases, loadPlantillaGrupos } from '@/lib/platform/talleres/plantilla'
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

  const [rutaEquipo, temporadasAbiertas, servidores, plantillaClases, plantillaGrupos] = await Promise.all([
    equipoId ? fetchRutaEquipo(client, equipoId) : Promise.resolve(null),
    permisos.abrirEdicion ? loadTemporadasAbiertas(client) : Promise.resolve([]),
    equipoId ? loadServidoresDelTaller(client, taller.id) : Promise.resolve([]),
    loadPlantillaClases(client, taller.id),
    loadPlantillaGrupos(client, taller.id),
  ])

  // "Abrir edición" derives sesiones estimadas from the active plantilla
  // clases when the taller has one (Decisiones). A taller with NO active
  // plantilla clases keeps today's form untouched (acceptance criterion
  // 8): `null` tells OpenEdicionForm to show its own "sesiones" field
  // again, exactly as before — there is no silent numeric fallback here.
  const clasesActivas = plantillaClases.filter((clase) => clase.activo).length
  const sesionesEstimadas = clasesActivas > 0 ? clasesActivas : null

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
              <TituloSistema nivel={1}>{taller.nombre}</TituloSistema>
            )}
            <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
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

      <section aria-labelledby="equipo-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="equipo-heading" className="text-lg font-semibold tracking-tight sm:text-xl">
            Equipo
          </h2>
          <Link
            href={RUTA_SERVIDORES}
            className="inline-flex min-h-[44px] items-center text-sm font-medium text-[var(--brand-primary)] hover:underline"
          >
            Gestionar en Servidores
          </Link>
        </div>

        {servidores.length === 0 ? (
          <div className="mt-3">
            <EstadoVacio
              icono={Users}
              titulo="Sin servidores activos en este equipo"
              subtitulo="Asigná servidores en Dream Team → Servidores para que aparezcan acá."
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
            sesionesEstimadas={sesionesEstimadas}
          />
        </div>
      )}

    </ContenedorDashboard>
  )
}
