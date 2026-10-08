/**
 * Dream Team — /admin/dream-team/servidores (RSC).
 *
 * Second of the three Dream Team screens: the pool of servidores (who
 * serves, where, in which role, in which stage) — Dream Team servicios PLUS
 * Grupos de Vida leaders/co-leaders surfaced read-only (see
 * lib/platform/dream-team/lideres-gdv.ts, lib/platform/dream-team/servidores.ts),
 * now grouped under the GROUP node they lead — a virtual node from
 * lib/platform/dream-team/estructura-gdv.ts. Server component loads
 * equipos + roles + servicios + GdV leaders + the virtual Grupos de Vida
 * branch, resolves display labels server-side and turns everything into the
 * flat serializable rows of lib/platform/dream-team/servidores-vista.ts; the
 * client island (components/dream-team/servidores/servidores-client.tsx)
 * renders, filters, sorts and groups them and drives the assigner and the
 * stage-advance API calls.
 *
 * The filters come from the URL (`?etapa=&direccion=&area=&equipo=&rol=&turno=&inicio=
 * &sin_cuenta=1&varios=1&q=&agrupar=&orden=`), including the legacy `?equipo=`
 * and `?estado=` of the links from Talleres and Estructura.
 *
 * Linked from the desktop sidebar's Dream Team entry
 * (components/ui/sidebar-moderna.tsx); the mobile bottom nav doesn't link it
 * yet.
 */
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  isDreamTeamEnabled,
  requireDreamTeamSession,
  hasDreamTeamReadCapability,
  hasDreamTeamWriteCapability,
} from '@/lib/platform/dream-team/route-access'
import { createSupabaseDreamTeamRepository } from '@/lib/platform/dream-team/repository-supabase'
import { construirArbol } from '@/lib/platform/dream-team/arbol'
import { construirNodosArbol, responsablesDreamTeamPorEquipo } from '@/lib/platform/dream-team/estructura-arbol'
import { fetchEstructuraGdv } from '@/lib/platform/dream-team/estructura-gdv'
import { fetchEquiposRegistrables } from '@/lib/platform/dream-team/ficha-persona'
import { fetchContactosPersonas, fetchNombresPersonas } from '@/lib/platform/dream-team/personas'
import { fetchLideresGdv } from '@/lib/platform/dream-team/lideres-gdv'
import type { DreamTeamRol } from '@/lib/platform/dream-team/types'
import { fetchFrecuenciasDeServicios, fetchTurnos, fetchTurnosDeServicios, type Turno } from '@/lib/platform/dream-team/turnos'
import { ROL_LIDER_GDV_LABELS, rolLabel } from '@/components/dream-team/labels'
import { ServidoresClient } from '@/components/dream-team/servidores/servidores-client'
import {
  indexarArbol,
  leerFiltrosDeUrl,
  type FilaServidor,
  type ParametrosDeUrl,
} from '@/lib/platform/dream-team/servidores-vista'

export const metadata = { title: 'Servidores' }

export interface DreamTeamServidoresPageProps {
  readonly searchParams?: Promise<Readonly<Record<string, string | readonly string[] | undefined>>>
}

export default async function DreamTeamServidoresPage({ searchParams }: DreamTeamServidoresPageProps = {}) {
  if (!isDreamTeamEnabled()) notFound()

  const session = await requireDreamTeamSession()
  if (!session) redirect('/login')

  if (!hasDreamTeamReadCapability(session)) notFound()

  const supabase = await createSupabaseServerClient()
  const repo = createSupabaseDreamTeamRepository(supabase)

  // RLS already scopes listServicios()/listEquipos() to what this session can
  // see (global for dream_team.org.manage, a single branch for a scoped
  // area director) — nothing here filters by scope again (see
  // estructura/page.tsx). listServicios({}) is called once, unfiltered: the
  // estado filter lives client-side so the "count per etapa" header can show
  // totals across all 6 states regardless of the currently applied filter.
  // fetchLideresGdv()/fetchEstructuraGdv() apply their own tree-authority
  // check server-side (see their docstrings) — a caller without authority
  // over the Grupos de Vida node simply gets zero rows back, same shape as
  // the RLS-scoped queries above.
  const [servicios, equipos, lideresGdv, nodosGdv] = await Promise.all([
    repo.listServicios({}),
    repo.listEquipos(),
    fetchLideresGdv(supabase),
    fetchEstructuraGdv(supabase),
  ])

  // Same tradeoff as estructura/page.tsx: listRolesPorEquipo() is per-equipo,
  // not bulk, so this is N parallel queries via Promise.all instead of one —
  // acceptable for an admin screen, and it reuses the repository method
  // verbatim. It also doubles as the role list the assigner needs for every
  // equipo node, not only the ones with existing servicios.
  const entradasRoles = await Promise.all(
    equipos.map(async (equipo): Promise<readonly [string, readonly DreamTeamRol[]]> => [
      equipo.id,
      await repo.listRolesPorEquipo(equipo.id),
    ]),
  )
  const rolesPorEquipo: Readonly<Record<string, readonly DreamTeamRol[]>> = Object.fromEntries(entradasRoles)
  const roles = entradasRoles.flatMap(([, rolesDelEquipo]) => rolesDelEquipo)
  const rolLabelPorId = new Map(roles.map((rol) => [rol.id, rol.label]))

  // Persona display names are not part of DreamTeamServicio (it only carries
  // personaId, see types.ts) and the repository has no join for them.
  // Resolving them here with a single bulk `usuarios.in(id)` lookup (see
  // lib/platform/dream-team/personas.ts) avoids an N+1 over
  // servicios.length + lideresGdv.length while keeping the dream-team
  // repository free of a cross-domain concern — usuarios is not a
  // dream-team table.
  const personaNombrePorId = await fetchNombresPersonas(supabase, [
    ...servicios.map((servicio) => servicio.personaId),
    ...lideresGdv.map((lider) => lider.personaId),
  ])

  // Phone (the one on the profile) and account status come from a scoped RPC:
  // `usuarios` has its own RLS (Grupos de Vida) that hides other people's rows
  // from a branch director. The RPC answers only for people the caller reaches
  // by tree, so a persona missing from the map is "not visible to you" and is
  // shown without phone or account mark, never as "sin cuenta".
  const contactoPorId = await fetchContactosPersonas(supabase, [
    ...servicios.map((servicio) => servicio.personaId),
    ...lideresGdv.map((lider) => lider.personaId),
  ])

  // Merge the real tree with the virtual Grupos de Vida branch (item 3) plus
  // who holds director/coordinador on each real node (item 4). This is what
  // makes a Grupos de Vida row's `equipoLabel` resolve to its group name
  // below — before this feature `equipoLabelPorId` only knew about real
  // equipos, so a GdV row (grouped under a group id, not a real equipo id)
  // always fell back to "Equipo no encontrado".
  const responsablesDreamTeam = responsablesDreamTeamPorEquipo(servicios, roles, personaNombrePorId)
  const nodosCombinados = construirNodosArbol(equipos, nodosGdv, responsablesDreamTeam)
  const arbol = construirArbol(nodosCombinados)

  const indice = indexarArbol(arbol)
  const ubicacion = (equipoId: string) => {
    const nodo = indice.get(equipoId)
    return {
      equipoLabel: nodo?.label ?? 'Equipo no encontrado',
      equipoRuta: nodo?.ruta ?? '',
      direccionId: nodo?.direccionId ?? equipoId,
    }
  }
  const puedeEditar = hasDreamTeamWriteCapability(session)
  // "Editar ficha" (T11): the equipos whose people the viewer may fix the
  // personal data of (the volunteer coordinator of the area, org.manage, admin
  // or pastor). Fails closed to none; the RPC checks it again on save.
  const equiposFicha = await fetchEquiposRegistrables(supabase)

  // Campus service shifts (D12): the filter's options and each servicio's
  // assignment. A convenience on top of the pool — if the lookup fails the
  // page renders without the filter, and the failure is logged.
  // Frequency is display-only: a failed read shows every turno as weekly.
  const frecuenciasPorServicio = await fetchFrecuenciasDeServicios(
    supabase,
    servicios.map((servicio) => servicio.id),
  ).catch(() => new Map<string, never>())
  const [turnos, turnosPorServicio] = await Promise.all([
    fetchTurnos(supabase),
    fetchTurnosDeServicios(
      supabase,
      servicios.map((servicio) => servicio.id),
    ),
  ]).catch((error: unknown): [Turno[], ReadonlyMap<string, readonly string[]>] => {
    console.error('[dream-team/servidores] shifts lookup failed', error)
    return [[], new Map()]
  })

  const filas: readonly FilaServidor[] = [
    ...servicios.map(
      (servicio): FilaServidor => ({
        clave: servicio.id,
        personaId: servicio.personaId,
        nombre: personaNombrePorId.get(servicio.personaId) ?? 'Persona no encontrada',
        equipoId: servicio.equipoId,
        ...ubicacion(servicio.equipoId),
        rolLabel: rolLabel(rolLabelPorId.get(servicio.rolId) ?? 'Rol no encontrado'),
        estado: servicio.estado,
        fechaInicio: servicio.fechaInicio,
        telefono: contactoPorId.get(servicio.personaId)?.telefono ?? null,
        tieneCuenta: contactoPorId.get(servicio.personaId)?.tieneCuenta ?? null,
        origen: 'dream_team',
        servicioId: servicio.id,
        version: servicio.version,
        editable: puedeEditar,
        fichaEditable: servicio.estado !== 'retirado' && equiposFicha.has(servicio.equipoId),
        turnoIds: turnosPorServicio.get(servicio.id) ?? [],
        frecuencias: frecuenciasPorServicio.get(servicio.id),
      }),
    ),
    ...lideresGdv.map(
      (lider): FilaServidor => ({
        clave: `gdv:${lider.personaId}:${lider.equipoId}`,
        personaId: lider.personaId,
        nombre: personaNombrePorId.get(lider.personaId) ?? 'Persona no encontrada',
        equipoId: lider.equipoId,
        ...ubicacion(lider.equipoId),
        rolLabel: ROL_LIDER_GDV_LABELS[lider.rol],
        estado: 'activo',
        fechaInicio: lider.desde,
        telefono: contactoPorId.get(lider.personaId)?.telefono ?? null,
        tieneCuenta: contactoPorId.get(lider.personaId)?.tieneCuenta ?? null,
        origen: 'grupos_vida',
        editable: false,
      }),
    ),
  ]

  const parametros: ParametrosDeUrl = (await searchParams) ?? {}

  return (
    <ServidoresClient
      filas={filas}
      arbol={arbol}
      rolesPorEquipo={rolesPorEquipo}
      puedeEditar={puedeEditar}
      filtrosIniciales={leerFiltrosDeUrl(parametros)}
      turnos={turnos.filter((turno) => turno.activo)}
    />
  )
}
