/**
 * /talleres/pendientes — the coordinator's cross-taller inbox: «¿qué espera
 * mi decisión?», across every taller the viewer reaches.
 *
 * R3e (odd/tasks/talleres-rediseno.md, S1, S2, S4): v2 list anatomy after
 * artboard design/talleres-interior/23 (approved in L6). The page loads and
 * gates; components/talleres/pendientes/pendientes-client.tsx renders.
 *
 * GATE (unchanged since T6, odd/tasks/talleres-consolidar-pantallas.md):
 * flag -> user -> session, each an informational card. No role is required
 * — RLS alone decides which rows come back («el rol deja de vivir en la
 * URL»). A viewer with nothing pending sees the empty state, not an error.
 *
 * WHAT IS PENDING (vista-pendientes.ts builds the items):
 *   - pendiente inscripciones (por verificar when a public reservation could
 *     not confirm the identity: taller_inscripciones.por_verificar),
 *   - pending solicitudes de retiro,
 *   - aprobada inscripciones without grupo in an abierta / en curso edición.
 * T10's estado audit filter (?estado=) is gone: the approved design is the
 * inbox only, and per-edición auditing lives in /talleres/[taller]/[edicion].
 *
 * PERMISSIONS: rows come from SEVERAL equipos, so permisos are resolved ONCE
 * PER DISTINCT EQUIPO (`cargarPermisosPorEquipos`, one batched call) and
 * applied PER ITEM as a plain boolean (`puedeDecidir`): aprobarInscripciones
 * for an inscripción, resolverRetiros for a retiro, gestionarGrupos for «sin
 * grupo». Only data crosses into the client island (no functions); the
 * server actions and RPCs check again.
 */

import { PendientesClient } from '@/components/talleres/pendientes/pendientes-client'
import { construirItems, leerFiltros } from '@/components/talleres/pendientes/vista-pendientes'
import { PaginaSistema, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { loadPendientesInscripciones, loadPendientesSolicitudes } from '@/lib/platform/talleres/pendientes'
import { cargarPermisosPorEquipos, PERMISOS_TALLER_ALL_FALSE } from '@/lib/platform/talleres/permisos'

export const metadata = { title: 'Pendientes' }

type Params = Record<string, string | string[] | undefined>

interface PageProps {
  readonly searchParams: Promise<Params>
}

function primero(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor
}

/** The gate's informational card. */
function aviso(texto: string) {
  return (
    <PaginaSistema titulo="Pendientes">
      <TarjetaSistema variante="outlined" className="p-6 text-center">
        <TextoSistema variante="sutil">{texto}</TextoSistema>
      </TarjetaSistema>
    </PaginaSistema>
  )
}

export default async function PendientesPage({ searchParams }: PageProps) {
  if (!isTalleresEnabled()) return aviso('El módulo de talleres está deshabilitado.')

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
  const params = await searchParams

  const [pendientes, aprobadas, solicitudes] = await Promise.all([
    loadPendientesInscripciones(client, ['pendiente']),
    loadPendientesInscripciones(client, ['aprobado']),
    loadPendientesSolicitudes(client),
  ])

  // One distinct-equipo set across every source, one batched call.
  const equipoIds = new Set<string | null>()
  for (const fuente of [pendientes, aprobadas]) {
    for (const row of fuente.rows) equipoIds.add(fuente.equipoIdByTallerId.get(row.taller_id) ?? null)
  }
  for (const solicitud of solicitudes) equipoIds.add(solicitud.equipoId)
  const permisosPorEquipo = await cargarPermisosPorEquipos(client, Array.from(equipoIds))

  const items = construirItems({
    pendientes,
    aprobadas,
    solicitudes,
    permisosDe: (equipoId) => permisosPorEquipo.get(equipoId) ?? PERMISOS_TALLER_ALL_FALSE,
  })

  return (
    <PendientesClient
      items={items}
      hoy={new Date().toISOString()}
      filtrosIniciales={leerFiltros({
        atencion: primero(params.atencion),
        taller: primero(params.taller),
        q: primero(params.q),
      })}
      itemInicial={primero(params.item) ?? null}
    />
  )
}
