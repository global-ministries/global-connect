/**
 * Dream Team — /dream-team/pendientes (RSC), odd/tasks/dream-team-pendientes-director.md
 * T4 (S1, S2, S4, S5, S6, S7; artboards design/pendientes-director/01 and 02).
 *
 * One place where a director sees and fixes what is missing in their team.
 * The database decides scope and alerts: dream_team_pendientes_resumen() and
 * dream_team_pendientes() (lib/platform/dream-team/pendientes.ts), both fail
 * closed. The pending cambio-de-área requests come from the same read as Mi
 * equipo (fetchSolicitudesCambioArea), only those the viewer resolves.
 *
 * Who opens it: the Mi equipo authorities whose scope the RPC reads — a Dream
 * Team reader or an area coordinator (hasDreamTeamPendientesAccess) — and
 * whoever registers people (puedeRegistrarParaNavegacion, as the sidebar); a
 * Grupos de Vida director by role alone gets a 404, as everybody else. What
 * the viewer may do is Mi equipo's role (rolMiEquipo); the actions are the
 * existing routes, which check again.
 */
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  hasDreamTeamPendientesAccess,
  hasDreamTeamWriteCapability,
  isDreamTeamEnabled,
  requireDreamTeamSession,
} from '@/lib/platform/dream-team/route-access'
import { puedeRegistrarParaNavegacion } from '@/lib/platform/dream-team/ficha-persona'
import { fetchSolicitudesCambioArea } from '@/lib/platform/dream-team/cambiar-area'
import { fetchPendientes, fetchResumenPendientes } from '@/lib/platform/dream-team/pendientes'
import { leerGrupoPendientes } from '@/lib/platform/dream-team/pendientes-vista'
import { permisosMiEquipo } from '@/lib/platform/dream-team/acciones-servicio'
import { rolMiEquipo } from '@/lib/platform/dream-team/mi-equipo-filtros'
import { createSupabaseDreamTeamRepository } from '@/lib/platform/dream-team/repository-supabase'
import type { DreamTeamRol } from '@/lib/platform/dream-team/types'
import { PendientesClient } from '@/components/dream-team/pendientes/pendientes-client'

export const metadata = { title: 'Pendientes' }

interface PendientesPageProps {
  readonly searchParams?: Promise<Readonly<Record<string, string | readonly string[] | undefined>>>
}

export default async function DreamTeamPendientesPage({ searchParams }: PendientesPageProps) {
  if (!isDreamTeamEnabled()) notFound()

  const session = await requireDreamTeamSession()
  if (!session) redirect('/login')

  const supabase = await createSupabaseServerClient()
  const puedeRegistrar = await puedeRegistrarParaNavegacion(supabase, true)
  if (!hasDreamTeamPendientesAccess(session) && !puedeRegistrar) notFound()

  const [resumen, filas, solicitudes] = await Promise.all([
    fetchResumenPendientes(supabase),
    fetchPendientes(supabase),
    fetchSolicitudesCambioArea(supabase),
  ])
  const rol = rolMiEquipo({ puedeEditar: hasDreamTeamWriteCapability(session), puedeRegistrar })

  // "Asignar" on an área sin servidores opens the assigner preselected there:
  // those áreas and, for whoever may assign, their roles (one read per área).
  const areas = filas.filter((fila) => fila.tipo === 'area_sin_servidores')
  const equiposAsignables = areas.map((fila) => ({
    id: fila.equipoId,
    etiqueta: fila.equipoRuta.at(-1) ?? 'Área',
    ruta: fila.equipoRuta,
  }))
  let rolesPorEquipo: Record<string, readonly DreamTeamRol[]> = {}
  if (permisosMiEquipo(rol).registrar && areas.length > 0) {
    const repo = createSupabaseDreamTeamRepository(supabase)
    rolesPorEquipo = Object.fromEntries(
      await Promise.all(areas.map(async (fila) => [fila.equipoId, await repo.listRolesPorEquipo(fila.equipoId)] as const)),
    )
  }

  return (
    <PendientesClient
      resumen={resumen}
      filas={filas}
      solicitudes={solicitudes.filter((solicitud) => solicitud.estado === 'pendiente' && solicitud.puedeResolver)}
      rol={rol}
      equiposAsignables={equiposAsignables}
      rolesPorEquipo={rolesPorEquipo}
      grupoInicial={leerGrupoPendientes((await searchParams)?.grupo)}
    />
  )
}
