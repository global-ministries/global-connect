/**
 * T6 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/pendientes,
 * the coordinator's cross-taller inbox: "¿qué espera mi decisión?", across
 * every taller the viewer reaches. Replaces
 * app/(auth)/talleres/coordinacion/inscripciones/page.tsx,
 * app/(auth)/talleres/coordinacion/solicitudes/page.tsx,
 * app/(auth)/talleres/direccion/solicitudes/page.tsx and the
 * cross-edición half of app/(auth)/admin/talleres/inscripciones/page.tsx
 * (that page's full multi-estado audit filter has no 1:1 replacement here
 * — see lib/platform/talleres/rutas.ts). All four keep working unmodified
 * until T10 deletes them.
 *
 * GATE, same shape as the other new pages: flag -> user -> session, each
 * an informational card. No role is required (unlike the old L/C/D
 * `requireOperacionalRole()` pattern) — RLS alone decides which rows come
 * back, per docs/talleres-de-punta-a-punta.md's "el rol deja de vivir en
 * la URL". A viewer with nothing pending sees EstadoVacio, not an error.
 *
 * PERMISSIONS: rows here come from SEVERAL equipos (unlike every other
 * T2-T5 page, which is scoped to exactly one taller from its URL), so a
 * single `cargarPermisos(client, equipoId)` call is wrong. Permisos are
 * resolved ONCE PER DISTINCT EQUIPO present across both sections
 * (`cargarPermisosPorEquipos` — batched, deduped, cached in a Map) and
 * applied PER ROW:
 *   - aprobarInscripciones -> TablaInscripciones's canWrite, now given a
 *     per-row resolver function instead of one flat boolean (see
 *     components/talleres/tabla-inscripciones.tsx). A row whose equipo
 *     the viewer cannot act on shows its estado badge instead of
 *     buttons — TablaInscripciones's existing canWrite=false fallback,
 *     just resolved per row now.
 *   - resolverRetiros -> whether ResolverSolicitudRetiroControls renders
 *     for that solicitud row at all (docs §8: "es un booleano, no una
 *     página" — direccion/solicitudes was read-only, coordinacion/
 *     solicitudes had the controls; here the controls simply appear
 *     when the viewer may act, per row).
 *
 * NAMES: inscripciones rows resolve persona names via the SECURITY
 * DEFINER RPC talleres_coord_inscripciones_personas (see
 * lib/platform/talleres/pendientes.ts's header for why this reuses
 * loadCoordInscripcionesPendientes and NOT loadAdminInscripciones). That
 * RPC is NOT deployed to production yet (#442) — until then, names
 * degrade to "—" quietly (TablaInscripciones's own existing rendering),
 * never an error toast.
 */

import { LogOut, Users as UsersIcon } from 'lucide-react'

import { ContenedorDashboard, BadgeSistema, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import { TablaInscripciones } from '@/components/talleres/tabla-inscripciones'
import { ResolverSolicitudRetiroControls } from '@/components/talleres/resolver-solicitud-retiro-controls'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import {
  loadPendientesInscripciones,
  loadPendientesSolicitudes,
  type PendienteSolicitudRow,
} from '@/lib/platform/talleres/pendientes'
import { cargarPermisosPorEquipos, PERMISOS_TALLER_ALL_FALSE } from '@/lib/platform/talleres/permisos'
import type { InscripcionAdminRow } from '@/lib/platform/talleres/inscripciones-types'
import {
  approveInscripcionAction,
  rejectInscripcionAction,
} from '@/lib/platform/talleres/inscripciones-actions'
import {
  aprobarSolicitudRetiroAction,
  rechazarSolicitudRetiroAction,
} from '@/lib/platform/talleres/solicitudes-retiro-actions'

export const metadata = { title: 'Pendientes' }

export default async function PendientesPage() {
  if (!isTalleresEnabled()) {
    return (
      <ContenedorDashboard titulo="Pendientes">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">El módulo de talleres está deshabilitado.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) {
    return (
      <ContenedorDashboard titulo="Pendientes">
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
      <ContenedorDashboard titulo="Pendientes">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">No se pudo resolver tu sesión.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase

  const [inscripciones, solicitudes] = await Promise.all([
    loadPendientesInscripciones(client),
    loadPendientesSolicitudes(client),
  ])

  // One distinct-equipo set across BOTH sections, so a viewer who is
  // e.g. coordinador of the same equipo for both an inscripcion and a
  // retiro only costs one RPC call for that equipo (cargarPermisosPorEquipos
  // dedupes internally too, but building one combined set keeps this to
  // exactly one batching call for the whole page).
  const equipoIds = new Set<string | null>()
  for (const row of inscripciones.rows) {
    equipoIds.add(inscripciones.equipoIdByTallerId.get(row.taller_id) ?? null)
  }
  for (const solicitud of solicitudes) {
    equipoIds.add(solicitud.equipoId)
  }

  const permisosPorEquipo = await cargarPermisosPorEquipos(client, Array.from(equipoIds))

  function permisosParaEquipo(equipoId: string | null) {
    return permisosPorEquipo.get(equipoId) ?? PERMISOS_TALLER_ALL_FALSE
  }

  const nadaPendiente = inscripciones.rows.length === 0 && solicitudes.length === 0

  return (
    <ContenedorDashboard
      titulo="Pendientes"
      subtitulo="Lo que espera tu decisión, en todos tus talleres."
    >
      {nadaPendiente ? (
        <EstadoVacio
          icono={UsersIcon}
          titulo="No tenés nada pendiente"
          subtitulo="Cuando algo necesite tu decisión, va a aparecer acá."
        />
      ) : (
        <div className="space-y-6">
          <section aria-labelledby="inscripciones-heading">
            <h2 id="inscripciones-heading" className="text-lg font-semibold tracking-tight sm:text-xl">
              Inscripciones por aprobar
            </h2>
            <div className="mt-3">
              {inscripciones.rows.length === 0 ? (
                <EstadoVacio icono={UsersIcon} titulo="No hay inscripciones pendientes" />
              ) : (
                <TablaInscripciones
                  rows={inscripciones.rows}
                  canWrite={(row: InscripcionAdminRow) =>
                    permisosParaEquipo(inscripciones.equipoIdByTallerId.get(row.taller_id) ?? null)
                      .aprobarInscripciones
                  }
                  onApprove={approveInscripcionAction}
                  onReject={rejectInscripcionAction}
                />
              )}
            </div>
          </section>

          <section aria-labelledby="retiros-heading">
            <h2 id="retiros-heading" className="text-lg font-semibold tracking-tight sm:text-xl">
              Retiros por resolver
            </h2>
            <div className="mt-3">
              {solicitudes.length === 0 ? (
                <EstadoVacio icono={LogOut} titulo="No hay retiros pendientes" />
              ) : (
                <ul className="grid gap-3">
                  {solicitudes.map((solicitud) => {
                    const puedeResolver = permisosParaEquipo(solicitud.equipoId).resolverRetiros
                    return (
                      <li key={solicitud.id}>
                        <TarjetaSistema variante="outlined" className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <TextoSistema className="font-medium">{tipoLabel(solicitud.tipo)}</TextoSistema>
                              <TextoSistema variante="sutil" className="mt-1 block text-xs">
                                {solicitud.tallerNombre ?? 'Taller no disponible'} · {formatFecha(solicitud.created_at)}
                              </TextoSistema>
                            </div>
                            <BadgeSistema variante="warning" tamaño="sm">
                              Pendiente
                            </BadgeSistema>
                          </div>
                          <TextoSistema className="mt-2 block text-sm">{solicitud.motivo}</TextoSistema>
                          {puedeResolver && (
                            <div className="mt-3 flex justify-end">
                              <ResolverSolicitudRetiroControls
                                solicitudId={solicitud.id}
                                onAprobar={aprobarSolicitudRetiroAction}
                                onRechazar={rechazarSolicitudRetiroAction}
                              />
                            </div>
                          )}
                        </TarjetaSistema>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}
    </ContenedorDashboard>
  )
}

function tipoLabel(tipo: PendienteSolicitudRow['tipo']): string {
  return tipo === 'participante_retiro' ? 'Retiro de participante' : 'Retiro definitivo del equipo'
}

function formatFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}
