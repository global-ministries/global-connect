/**
 * T5 (odd/tasks/talleres-consolidar-pantallas.md) —
 * /talleres/[taller]/[edicion]/[grupo], the grupo detail screen. Replaces
 * app/(auth)/talleres/equipo/mis-grupos/[id]/asistencia/page.tsx and
 * .../reporte/page.tsx — both keep working unmodified until T10 deletes
 * them. Sections: cabecera, su gente, clases, asistencia (read-only —
 * marking is paso 7), reporte.
 *
 * GATE, same shape as /talleres/[taller]/[edicion]: flag -> user ->
 * session, each an informational card. Then a THREE-level resolution: the
 * grupo must exist, belong to the edición in the URL, whose taller must
 * match the slug in the URL — see lib/platform/talleres/grupo-detalle.ts's
 * header for the full permissions evidence this design is built on.
 *
 * A real líder is identified by an active taller_grupo_asignaciones row
 * with rol='lider', and today lead.* capabilities are NEVER effectively
 * auto-granted to them (supabase/tests/talleres-t5-lider-lectura.test.sql,
 * finding 6) — so a real líder can hold ZERO talleres capability. RLS on
 * taller_grupos has no "assigned to this grupo" branch (only
 * taller_grupo_asignaciones does — same test file, findings 1-2), so
 * loadGrupoDetalle can come back null for someone who genuinely leads the
 * grupo. Before calling notFound() on a null grupo, the page checks
 * loadMiAsignacionGrupo (the caller's OWN assignment row — always
 * readable, own-row RLS branch) and resolveEquipoDeGrupo (a public-safe
 * SECURITY DEFINER resolver, EXECUTE already granted to `authenticated`)
 * to tell "genuinely not found / not yours" (404) apart from "yours, but
 * RLS hides the full record today" (an honest limited state, in Spanish,
 * naming what's missing — never a broken page, and never a new grant).
 *
 * PERMISSIONS: one cargarPermisos(client, taller.dream_team_equipo_id)
 * call for the whole page. permisos.verReportes only drives the reporte
 * section's honest empty-state copy ("aún no hay reporte" vs. "no tenés
 * permiso para verlo") since RLS already decides what data arrives either
 * way.
 *
 * T3 (odd/tasks/talleres-asistencia-lider.md): the WRITE controls live
 * here too. Who may pass list / close a clase is a RELATIONSHIP question
 * answered by talleres_rol_en_grupo (miRol), with permisos.gestionarGrupos
 * as the supervisor fallback (criterio 8) — never the capability tree
 * alone, because an assigned líder can hold ZERO talleres capabilities.
 * Both controls are gated by permission AND by `clase.estado !== 'cerrada'`
 * and rendered HIDDEN, never disabled (Decisiones, §9). The route then
 * re-checks nothing: talleres_registrar_asistencia / talleres_cerrar_clase
 * are the authorization authority.
 *
 * T2 (odd/tasks/talleres-lider-identidad.md): a grupo member (líder or
 * voluntario, via T1's talleres_es_miembro_del_grupo) reads by relation,
 * not by capability. Once T1's RLS lets taller_grupos resolve for them,
 * this page's existing grupo != null branch already renders the full
 * view — no separate membership gate needed there. esMiembro is its own
 * boolean (loadEsMiembroDelGrupo — deliberately NOT folded into
 * cargarPermisos/talleres_mis_permisos, which answers a different
 * question for a different kind of node) used only to keep the
 * asistencia/reporte empty-state copy honest: `permisos.ver/verReportes
 * || esMiembro`, so a capability-less member sees "aún no hay ..." and
 * never a false "no tenés permiso". Fails soft to false (RPC missing,
 * e.g. production pre-T3), which just keeps pre-T2 behaviour.
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Users, Calendar, ClipboardList, FileText } from 'lucide-react'

import {
  ContenedorDashboard,
  BadgeSistema,
  TarjetaSistema,
  TextoSistema,
} from '@/components/ui/sistema-diseno'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import { LecturaAsistenciaClase } from '@/components/talleres/lectura-asistencia-clase.client'
import {
  RegistroAsistenciaClase,
  type RegistroAsistenciaMarca,
} from '@/components/talleres/registro-asistencia-clase.client'
import { CerrarClase } from '@/components/talleres/cerrar-clase.client'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { loadTallerDetalle } from '@/lib/platform/talleres/catalogo'
import { loadEdicionLocalDetalle, type EdicionLocalDetalle } from '@/lib/platform/talleres/operacional'
import {
  loadGrupoDetalle,
  loadMiAsignacionGrupo,
  resolveEquipoDeGrupo,
  loadGrupoAsignaciones,
  loadGrupoSesiones,
  loadAsistenciaPorClase,
  loadGrupoReporte,
  loadGrupoInscripciones,
  loadEsMiembroDelGrupo,
  loadRolEnGrupo,
  type AsistenciaPersonaRow,
} from '@/lib/platform/talleres/grupo-detalle'
import { cargarPermisos } from '@/lib/platform/talleres/permisos'
import { rutaTaller, rutaEdicion, rutaGrupo } from '@/lib/platform/talleres/rutas'

export const metadata = { title: 'Grupo' }

interface RouteContext {
  readonly params: Promise<{
    readonly taller: string
    readonly edicion: string
    readonly grupo: string
  }>
  readonly searchParams?: Promise<{ readonly clase?: string }>
}

export default async function GrupoDetallePage(ctx: RouteContext) {
  if (!isTalleresEnabled()) {
    return (
      <ContenedorDashboard titulo="Grupo">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">El módulo de talleres está deshabilitado.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  const { taller: tallerSlug, edicion: edicionIdParam, grupo: grupoId } = await ctx.params
  const sp = ctx.searchParams ? await ctx.searchParams : {}

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) {
    return (
      <ContenedorDashboard titulo="Grupo">
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
      <ContenedorDashboard titulo="Grupo">
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

  const grupo = await loadGrupoDetalle(client, grupoId)
  let edicion: EdicionLocalDetalle | null = null
  let modoLimitado = false

  // T2 (odd/tasks/talleres-lider-identidad.md): "soy miembro de este
  // grupo" is its OWN boolean, resolved via talleres_es_miembro_del_grupo
  // (T1's migration) — never folded into cargarPermisos/talleres_mis_
  // permisos, which answers a different question (what can I do at this
  // org-chart node; a grupo is not a node). Fails soft to false when the
  // RPC doesn't exist yet (production, pre-T3), so this never crashes the
  // page — it just leaves the honest copy exactly as it was before T2.
  const esMiembro = await loadEsMiembroDelGrupo(client, grupoId)

  // T3: talleres_rol_en_grupo answers the same kind of RELATIONSHIP
  // question as esMiembro — 'lider' | 'voluntario' | NULL for THIS caller
  // in THIS grupo — and is what decides who may pass list / close a clase.
  // Fails soft to NULL (an outsider) when the RPC isn't deployed yet, so
  // the page keeps rendering the read view exactly as before.
  const miRol = await loadRolEnGrupo(client, grupoId)

  if (grupo) {
    // T1's RLS membership branch already lets an assigned líder/voluntario
    // read taller_grupos directly (staging) — once that's true, grupo
    // resolves here and the full read view renders below, no degraded
    // state, for a member exactly as for a capability holder.
    edicion = await loadEdicionLocalDetalle(client, grupo.edicionId)
    if (!edicion || edicion.id !== edicionIdParam || edicion.taller_slug !== taller.slug) {
      notFound()
    }
  } else {
    // RLS hid taller_grupos from this caller — before assuming "not
    // found", check the ONE row they can always read regardless of
    // capability: their own assignment.
    const miAsignacion = await loadMiAsignacionGrupo(client, grupoId, session.personaId)
    if (!miAsignacion) {
      notFound()
    }
    // Confirm the grupo at least belongs to THIS taller via the public-safe
    // resolver — never grants anything, just avoids rendering a limited
    // page under a completely unrelated taller's URL.
    const equipoDeGrupo = await resolveEquipoDeGrupo(client, grupoId)
    if (!equipoDeGrupo || equipoDeGrupo !== taller.dream_team_equipo_id) {
      notFound()
    }
    // An own asignación row means genuine membership even in this branch
    // (an environment where taller_grupos' SELECT policy doesn't have the
    // membership OR branch yet, e.g. production pre-T3) — the cabecera
    // fields still can't be read, so the state stays limited, but the
    // reporte/asistencia sections below get the honest "not yet" copy
    // rather than a false "no permission" one.
    modoLimitado = true
    // Best-effort: the edición may still resolve on its own carve-out
    // (any authenticated user, when abierto/en_curso) even though the
    // grupo->cohorte->edición chain itself is hidden.
    edicion = await loadEdicionLocalDetalle(client, edicionIdParam)
  }

  const permisos = await cargarPermisos(client, taller.dream_team_equipo_id)

  // T3 — who may ACT on this screen. miRol is the relationship answer;
  // permisos.gestionarGrupos is the supervisor fallback (coordinador/
  // director with scope over this taller) — criterio 8, never the
  // capability tree alone: an assigned líder with ZERO capabilities must
  // still pass list. modoLimitado means even the cabecera is hidden, so no
  // write control is offered there either.
  const puedePasarLista = !modoLimitado && (miRol !== null || permisos.gestionarGrupos)
  const puedeCerrarClase = !modoLimitado && (miRol === 'lider' || permisos.gestionarGrupos)

  const asignaciones = await loadGrupoAsignaciones(client, grupoId)
  // T4 (odd/tasks/talleres-inscripcion-a-grupo.md) — "su gente" real: the
  // inscripciones actually placed in this grupo, not the equipo roster
  // above (which is a different concept — líder/voluntario team, T1's
  // Decisiones). Retiradas are kept for history but never counted.
  const inscripcionesGrupo = await loadGrupoInscripciones(client, grupoId)
  const sesiones = await loadGrupoSesiones(client, grupoId)
  const reporte = await loadGrupoReporte(client, grupoId)

  const claseSeleccionadaId = sp.clase ?? sesiones[0]?.id ?? null
  // T2 (odd/tasks/talleres-asistencia-lider.md): the read view titles the
  // clase ("Clase {numero} · {tema}"), so it can only render for a clase
  // that belongs to THIS grupo — an id that is not in the list (a stale or
  // hand-edited ?clase=) resolves to no selected clase at all instead of
  // loading rows this page could not title. RLS still decides what data
  // arrives either way; this just keeps the view honest.
  const claseSeleccionada = sesiones.find((s) => s.id === claseSeleccionadaId) ?? null
  const asistencia = claseSeleccionada
    ? await loadAsistenciaPorClase(client, claseSeleccionada.id)
    : []

  // T3 — an editable clase shows the register (todos presentes por defecto,
  // previous marks restoring what was already marked); a `cerrada` one shows
  // ONLY the read view, with the controls gone entirely (Decisiones).
  const puedeEditarClase = puedePasarLista && claseSeleccionada?.estado !== 'cerrada'

  const lideres = asignaciones.filter((a) => a.rol === 'lider')

  return (
    <ContenedorDashboard
      titulo={grupo?.nombre ?? 'Grupo'}
      botonRegreso={
        edicion
          ? { href: rutaEdicion(taller.slug, edicion.id), texto: edicion.nombre_snapshot }
          : { href: rutaTaller(taller.slug), texto: taller.nombre }
      }
    >
      {modoLimitado && (
        <TarjetaSistema variante="outlined" className="p-4">
          <TextoSistema role="status">
            Vemos que lideras este grupo, pero todavía no tenés el permiso para ver toda su
            información (nombre, clases, asistencia y reporte). Esto se resuelve cuando se te
            asigne el permiso de líder.
          </TextoSistema>
        </TarjetaSistema>
      )}

      {/* Cabecera */}
      <TarjetaSistema variante="outlined" className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <Link href={rutaTaller(taller.slug)} className="text-sm font-medium text-foreground hover:underline">
              {taller.nombre}
            </Link>
            {edicion && (
              <Link
                href={rutaEdicion(taller.slug, edicion.id)}
                className="block text-sm text-muted-foreground hover:underline"
              >
                {edicion.nombre_snapshot}
              </Link>
            )}
            {grupo ? (
              <TextoSistema variante="sutil" tamaño="sm" className="block">
                Capacidad {grupo.capacidad}
              </TextoSistema>
            ) : (
              <TextoSistema variante="sutil" tamaño="sm" className="block">
                Todavía no podés ver la capacidad de este grupo.
              </TextoSistema>
            )}
            {lideres.length > 0 && (
              <TextoSistema variante="sutil" tamaño="sm" className="block">
                Líder(es): {lideres.map((l) => l.nombre ?? 'Nombre no disponible').join(', ')}
              </TextoSistema>
            )}
          </div>
          {grupo && <BadgeSistema>{grupo.estado}</BadgeSistema>}
        </div>
      </TarjetaSistema>

      {/* Equipo (líder/voluntario — taller_grupo_asignaciones, distinto de
          "su gente" abajo: T1's Decisiones, odd/tasks/talleres-
          inscripcion-a-grupo.md) */}
      <section aria-labelledby="equipo-heading">
        <h2 id="equipo-heading" className="text-lg font-semibold tracking-tight sm:text-xl">
          Equipo
        </h2>
        <div className="mt-3">
          {asignaciones.length === 0 ? (
            <EstadoVacio icono={Users} titulo="No hay personas asignadas todavía" />
          ) : (
            <ul className="space-y-2">
              {asignaciones.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3"
                >
                  <TextoSistema className="text-sm">{a.nombre ?? 'Nombre no disponible'}</TextoSistema>
                  <BadgeSistema variante={a.rol === 'lider' ? 'info' : 'default'} tamaño="sm">
                    {a.rol === 'lider' ? 'Líder' : 'Voluntario'}
                  </BadgeSistema>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Su gente (T4, odd/tasks/talleres-inscripcion-a-grupo.md) — the
          inscripciones actually placed in this grupo. Aprobadas is the
          roster; retiradas are kept for history, shown apart, muted, and
          never counted (Decisiones). */}
      <section aria-labelledby="gente-heading">
        <h2 id="gente-heading" className="text-lg font-semibold tracking-tight sm:text-xl">
          Su gente
        </h2>
        <div className="mt-3">
          {inscripcionesGrupo.aprobadas.length === 0 && inscripcionesGrupo.retiradas.length === 0 ? (
            <EstadoVacio icono={Users} titulo="No hay participantes todavía" />
          ) : (
            <div className="space-y-4">
              {inscripcionesGrupo.aprobadas.length === 0 ? (
                <TextoSistema variante="sutil" className="text-sm">
                  No hay participantes aprobados todavía.
                </TextoSistema>
              ) : (
                <ul className="space-y-2">
                  {inscripcionesGrupo.aprobadas.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3"
                    >
                      <TextoSistema className="text-sm">{p.nombre}</TextoSistema>
                    </li>
                  ))}
                </ul>
              )}
              {inscripcionesGrupo.retiradas.length > 0 && (
                <div>
                  <TextoSistema variante="sutil" className="mb-2 block text-xs uppercase tracking-wide">
                    Retirados
                  </TextoSistema>
                  <ul className="space-y-2">
                    {inscripcionesGrupo.retiradas.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border/40 p-3 opacity-60"
                      >
                        <TextoSistema variante="sutil" className="text-sm">
                          {p.nombre}
                        </TextoSistema>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Clases */}
      <section aria-labelledby="clases-heading">
        <h2 id="clases-heading" className="text-lg font-semibold tracking-tight sm:text-xl">
          Clases
        </h2>
        <div className="mt-3">
          {sesiones.length === 0 ? (
            <EstadoVacio
              icono={Calendar}
              titulo={
                modoLimitado
                  ? 'Todavía no tenés permiso para ver las clases de este grupo'
                  : 'No hay clases todavía'
              }
            />
          ) : (
            <ul className="space-y-2">
              {sesiones.map((s) => (
                <li
                  key={s.id}
                  className="rounded-lg border border-border/60 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-3">
                      {/* Decisiones (Interfaz): "Clase {numero} · {tema}".
                          Deferred from T2 with an explicit "decidir si entra
                          en T3" — it does, since the same section renders the
                          tema everywhere else. A clase without tema keeps the
                          bare "Clase {numero}"; we never invent a name. */}
                      <Link
                        href={`${rutaGrupo(taller.slug, edicionIdParam, grupoId)}?clase=${s.id}`}
                        className={
                          s.id === claseSeleccionadaId
                            ? 'text-sm font-medium text-foreground underline'
                            : 'text-sm font-medium text-foreground hover:underline'
                        }
                      >
                        Clase {s.numero}
                        {s.tema ? ` · ${s.tema}` : ''}
                      </Link>
                      <TextoSistema variante="sutil" tamaño="sm">
                        {formatFecha(s.fechaProgramada)}
                      </TextoSistema>
                      <BadgeSistema tamaño="sm">{s.estado}</BadgeSistema>
                    </div>

                    {/* T3 — each clase carries its own "Pasar lista" link
                        (selects the clase below) and "Cerrar clase" button.
                        Both are HIDDEN once the clase is cerrada (never a
                        disabled control), and only for someone who may act:
                        miRol (relación con este grupo) o gestión con alcance. */}
                    {(puedePasarLista || puedeCerrarClase) && s.estado !== 'cerrada' && (
                      <div className="flex flex-wrap items-center gap-2">
                        {puedePasarLista && (
                          <Link
                            href={`${rutaGrupo(taller.slug, edicionIdParam, grupoId)}?clase=${s.id}`}
                            className="inline-flex min-h-[44px] items-center rounded-lg border-2 border-border px-3 text-sm font-medium text-foreground hover:bg-accent"
                          >
                            Pasar lista
                          </Link>
                        )}
                        {puedeCerrarClase && <CerrarClase sesionId={s.id} />}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Asistencia — T3 makes this section writable for whoever may act:
          the register (registro-asistencia-clase.client) replaces the read
          view while the selected clase is editable; once it is `cerrada`
          the read view is all that remains. */}
      <section aria-labelledby="asistencia-heading">
        <h2 id="asistencia-heading" className="text-lg font-semibold tracking-tight sm:text-xl">
          Asistencia
        </h2>
        <div className="mt-3">
          {sesiones.length === 0 || !claseSeleccionada ? (
            <TextoSistema variante="sutil">Elegí una clase para ver su asistencia.</TextoSistema>
          ) : puedeEditarClase ? (
            <RegistroAsistenciaClase
              // A different clase is a different form: re-seed "todos
              // presentes / previous marks" instead of carrying state over.
              key={claseSeleccionada.id}
              sesionId={claseSeleccionada.id}
              numero={claseSeleccionada.numero}
              tema={claseSeleccionada.tema}
              filas={inscripcionesGrupo.aprobadas.map((p) => ({ id: p.id, nombre: p.nombre }))}
              marcasPrevias={marcasPreviasDe(asistencia)}
            />
          ) : asistencia.length === 0 ? (
            <EstadoVacio
              icono={ClipboardList}
              titulo={
                // A grupo member reads this by relation (T2), not by
                // capability — RLS already decided what data arrives, so
                // an empty result for a member is honestly "nothing yet",
                // never "no permission".
                permisos.ver || esMiembro
                  ? 'Aún no hay asistencia registrada para esta clase'
                  : 'No tenés permiso para ver la asistencia de esta clase'
              }
            />
          ) : (
            <LecturaAsistenciaClase
              numero={claseSeleccionada.numero}
              tema={claseSeleccionada.tema}
              filas={asistencia}
            />
          )}
        </div>
      </section>

      {/* Reporte */}
      <section aria-labelledby="reporte-heading">
        <h2 id="reporte-heading" className="text-lg font-semibold tracking-tight sm:text-xl">
          Reporte
        </h2>
        <div className="mt-3">
          {!reporte ? (
            <EstadoVacio
              icono={FileText}
              titulo={
                // Same relation-vs-capability honesty as asistencia above.
                permisos.verReportes || esMiembro
                  ? 'Aún no hay reporte para este grupo'
                  : 'No tenés permiso para ver el reporte de este grupo'
              }
            />
          ) : (
            <TarjetaSistema variante="elevated" className="p-4">
              <TextoSistema variante="sutil" className="block text-sm">
                {reporte.observacionesGenerales || '(sin observaciones)'}
              </TextoSistema>
              <div className="mt-3 flex flex-wrap gap-2">
                <BadgeSistema>{reporteEstadoLabel(reporte.estado)}</BadgeSistema>
                {reporte.firmaLiderFecha && (
                  <BadgeSistema variante="success">Firmado {formatFecha(reporte.firmaLiderFecha)}</BadgeSistema>
                )}
                {reporte.reabiertoMotivo && <BadgeSistema variante="error">Reabierto</BadgeSistema>}
              </div>
            </TarjetaSistema>
          )}
        </div>
      </section>
    </ContenedorDashboard>
  )
}

/**
 * T3 — the previous marks the register restores. Only presente/ausente can
 * be re-sent (talleres_registrar_asistencia's domain); a legacy
 * `no_aplica` row is not representable in the register, so it is left out
 * and that person falls back to the default "presente" — never invented as
 * a mark of our own.
 */
function marcasPreviasDe(rows: readonly AsistenciaPersonaRow[]): RegistroAsistenciaMarca[] {
  const marcas: RegistroAsistenciaMarca[] = []
  for (const row of rows) {
    if (row.estado === 'presente' || row.estado === 'ausente') {
      marcas.push({ inscripcionId: row.inscripcionId, estado: row.estado, motivo: row.motivo })
    }
  }
  return marcas
}

function reporteEstadoLabel(estado: string): string {
  switch (estado) {
    case 'borrador':
      return 'Borrador'
    case 'enviado':
      return 'Enviado'
    case 'reabierto':
      return 'Reabierto'
    case 'cerrado':
      return 'Cerrado'
    default:
      return estado
  }
}

function formatFecha(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('es')
}
