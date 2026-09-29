/**
 * Dream Team — /dream-team/mi-equipo (RSC).
 *
 * The operative view for an area director (outside /admin), linked from the
 * desktop sidebar's Dream Team entry (components/ui/sidebar-moderna.tsx). It
 * shows ONE direccion at a time — a root node of the org tree the caller
 * reaches, chosen by `?direccion=<id>` and defaulting to the first one with
 * people — as team cards plus the people of the selected team.
 *
 * Data: real equipos PLUS the virtual Grupos de Vida branch merged in (see
 * lib/platform/dream-team/estructura-gdv.ts, estructura-arbol.ts), and per
 * node who serves there with their current stage: Dream Team servicios PLUS
 * Grupos de Vida leaders/co-leaders surfaced read-only (see
 * lib/platform/dream-team/lideres-gdv.ts, servidores.ts). Shaping it into
 * cards and people is pure and lives in
 * lib/platform/dream-team/mi-equipo-vista.ts.
 *
 * Only serializable data reaches the client island — no components, icons or
 * functions cross the server/client boundary.
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
import { construirNodosArbol } from '@/lib/platform/dream-team/estructura-arbol'
import { fetchEstructuraGdv } from '@/lib/platform/dream-team/estructura-gdv'
import { fetchNombresPersonas } from '@/lib/platform/dream-team/personas'
import { fetchLideresGdv } from '@/lib/platform/dream-team/lideres-gdv'
import {
  equiposAsignables as listarEquiposAsignables,
  listarDirecciones,
  normalizarTexto,
  vistaDeDireccion,
  type PersonaEntrada,
} from '@/lib/platform/dream-team/mi-equipo-vista'
import type { DreamTeamRol } from '@/lib/platform/dream-team/types'
import { ROL_LIDER_GDV_LABELS, rolLabel } from '@/components/dream-team/labels'
import { MiEquipoClient } from '@/components/dream-team/mi-equipo/mi-equipo-client'

export const metadata = { title: 'Mi equipo' }

interface MiEquipoPageProps {
  readonly searchParams?: Promise<{ readonly direccion?: string | readonly string[] }>
}

export default async function DreamTeamMiEquipoPage({ searchParams }: MiEquipoPageProps) {
  if (!isDreamTeamEnabled()) notFound()

  const session = await requireDreamTeamSession()
  if (!session) redirect('/login')

  if (!hasDreamTeamReadCapability(session)) notFound()

  const supabase = await createSupabaseServerClient()
  const repo = createSupabaseDreamTeamRepository(supabase)

  // RLS scopes listEquipos() to the caller's own branch (or globally for
  // dream_team.org.manage). The topmost node the caller reaches arrives with
  // a parentEquipoId that resolves to nothing in this list — construirArbol()
  // already treats that as a visible root instead of an invisible orphan
  // (see its docstring), which is exactly the "no ve a su padre" case.
  // fetchEstructuraGdv() applies its own tree-authority check server-side — a
  // director without reach into the Grupos de Vida node gets zero rows back,
  // so the virtual branch just doesn't appear.
  const equipos = await repo.listEquipos()

  // listServicios({}) once (RLS-scoped to the same branch) and group locally
  // by equipoId, instead of one listServicios({ equipoId }) call per node —
  // avoids N+1 over the branch's equipo count. fetchLideresGdv() applies its
  // own tree-authority check server-side, same zero-rows shape.
  const [servicios, entradasRoles, lideresGdv, nodosGdv] = await Promise.all([
    repo.listServicios({}),
    Promise.all(
      equipos.map(async (equipo): Promise<readonly [string, readonly DreamTeamRol[]]> => [
        equipo.id,
        await repo.listRolesPorEquipo(equipo.id),
      ]),
    ),
    fetchLideresGdv(supabase),
    fetchEstructuraGdv(supabase),
  ])

  const rolLabelPorId = new Map(entradasRoles.flatMap(([, roles]) => roles).map((rol) => [rol.id, rol.label]))

  // usuarios is not a dream-team table, so persona names are resolved here
  // with a single bulk lookup over servicio persona ids PLUS GdV leader ids.
  const personaNombrePorId = await fetchNombresPersonas(supabase, [
    ...servicios.map((servicio) => servicio.personaId),
    ...lideresGdv.map((lider) => lider.personaId),
  ])

  const arbol = construirArbol(construirNodosArbol(equipos, nodosGdv))
  const equipoIdsVisibles = new Set([...equipos.map((equipo) => equipo.id), ...nodosGdv.map((nodo) => nodo.nodoId)])

  const personasPorEquipo: Record<string, PersonaEntrada[]> = {}
  const agregar = (equipoId: string, persona: PersonaEntrada): void => {
    if (equipoIdsVisibles.has(equipoId)) (personasPorEquipo[equipoId] ??= []).push(persona)
  }

  for (const servicio of servicios) {
    const rolCrudo = rolLabelPorId.get(servicio.rolId)
    agregar(servicio.equipoId, {
      clave: servicio.id,
      personaId: servicio.personaId,
      nombre: personaNombrePorId.get(servicio.personaId) ?? 'Persona no encontrada',
      rolClave: rolCrudo ? normalizarTexto(rolCrudo) : 'desconocido',
      rolLabel: rolCrudo ? rolLabel(rolCrudo) : 'Rol no encontrado',
      estado: servicio.estado,
      origen: 'dream_team',
      servicioId: servicio.id,
      version: servicio.version,
    })
  }
  // A leader of two groups is two rows (one per group), hence the equipo in the key.
  for (const lider of lideresGdv) {
    agregar(lider.equipoId, {
      clave: `gdv:${lider.personaId}:${lider.equipoId}`,
      personaId: lider.personaId,
      nombre: personaNombrePorId.get(lider.personaId) ?? 'Persona no encontrada',
      rolClave: lider.rol,
      rolLabel: ROL_LIDER_GDV_LABELS[lider.rol],
      estado: 'activo',
      origen: 'grupos_vida',
    })
  }

  const direcciones = listarDirecciones(arbol, personasPorEquipo)
  const pedida = (await searchParams)?.direccion
  const direccionPedida = Array.isArray(pedida) ? pedida[0] : (pedida as string | undefined)
  const direccionId = direcciones.find((direccion) => direccion.id === direccionPedida)?.id ?? direcciones[0]?.id ?? ''

  const asignables = direccionId ? listarEquiposAsignables(arbol, direccionId) : []
  const rolesPorEquipo: Record<string, readonly DreamTeamRol[]> = Object.fromEntries(
    entradasRoles.filter(([equipoId]) => asignables.some((equipo) => equipo.id === equipoId)),
  )

  return (
    <MiEquipoClient
      direcciones={direcciones}
      vista={direccionId ? vistaDeDireccion(arbol, personasPorEquipo, direccionId) : null}
      direccionId={direccionId}
      puedeEditar={hasDreamTeamWriteCapability(session)}
      equiposAsignables={asignables}
      rolesPorEquipo={rolesPorEquipo}
    />
  )
}
