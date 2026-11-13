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
 * The filters come from the URL (`?etapa=&direccion=&area=&equipo=&rol=&turno=&edad=&inicio=
 * &sin_cuenta=1&invitacion=&varios=1&por_activar=1&q=&agrupar=&orden=`), including the legacy `?equipo=`
 * and `?estado=` of the links from Talleres and Estructura.
 *
 * Linked from the desktop sidebar's Dream Team entry
 * (components/ui/sidebar-moderna.tsx); the mobile bottom nav doesn't link it
 * yet.
 */
import { notFound, redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isDreamTeamEnabled,
  requireDreamTeamSession,
  hasDreamTeamReadCapability,
  hasDreamTeamWriteCapability,
} from "@/lib/platform/dream-team/route-access";
import { createSupabaseDreamTeamRepository } from "@/lib/platform/dream-team/repository-supabase";
import { construirArbol } from "@/lib/platform/dream-team/arbol";
import {
  construirNodosArbol,
  responsablesDreamTeamPorEquipo,
} from "@/lib/platform/dream-team/estructura-arbol";
import { fetchEstructuraGdv } from "@/lib/platform/dream-team/estructura-gdv";
import {
  fetchEquiposRegistrables,
  fetchFichasEditables,
} from "@/lib/platform/dream-team/ficha-persona";
import { fetchEquiposCambioArea } from "@/lib/platform/dream-team/cambiar-area";
import {
  fetchContactosPersonas,
  fetchNombresPersonas,
} from "@/lib/platform/dream-team/personas";
import { fetchLideresGdv } from "@/lib/platform/dream-team/lideres-gdv";
import {
  fetchRangosEdad,
  type RangoEdad,
} from "@/lib/platform/dream-team/edad";
import type { PersonaId } from "@/lib/platform/dream-team/types";
import type { DreamTeamRol } from "@/lib/platform/dream-team/types";
import {
  fetchFrecuenciasDeServicios,
  fetchTurnos,
  fetchTurnosDeServicios,
  type Turno,
} from "@/lib/platform/dream-team/turnos";
import { ROL_LIDER_GDV_LABELS, rolLabel } from "@/components/dream-team/labels";
import { ServidoresClient } from "@/components/dream-team/servidores/servidores-client";
import {
  adjuntarInvitaciones,
  fetchInvitacionesServidores,
  rpcDeCliente,
} from "@/lib/platform/dream-team/servidores-invitaciones";
import {
  indexarArbol,
  leerFiltrosDeUrl,
  type FilaServidor,
  type ParametrosDeUrl,
} from "@/lib/platform/dream-team/servidores-vista";

export const metadata = { title: "Servidores" };

export interface DreamTeamServidoresPageProps {
  readonly searchParams?: Promise<
    Readonly<Record<string, string | readonly string[] | undefined>>
  >;
}

export default async function DreamTeamServidoresPage({
  searchParams,
}: DreamTeamServidoresPageProps = {}) {
  if (!isDreamTeamEnabled()) notFound();

  const session = await requireDreamTeamSession();
  if (!session) redirect("/login");

  if (!hasDreamTeamReadCapability(session)) notFound();

  const supabase = await createSupabaseServerClient();
  const repo = createSupabaseDreamTeamRepository(supabase);

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
  // Every read that doesn't depend on another runs in one parallel batch:
  // the screen waits for the slowest request, not for the sum of all of them
  // (odd/tasks/rendimiento-sistema.md, T2). Roles come in one request
  // (listRoles) instead of one per equipo.
  const [
    servicios,
    equipos,
    todosLosRoles,
    lideresGdv,
    nodosGdv,
    equiposFicha,
  ] = await Promise.all([
    repo.listServicios({}),
    repo.listEquipos(),
    repo.listRoles(),
    fetchLideresGdv(supabase),
    fetchEstructuraGdv(supabase),
    // "Editar ficha" (T11): the equipos whose people the viewer may fix the
    // personal data of (the volunteer coordinator of the area, org.manage,
    // admin or pastor). Fails closed to none; the RPC checks it again on save.
    fetchEquiposRegistrables(supabase),
  ]);

  // The role list the assigner needs for every equipo node, not only the ones
  // with existing servicios. dream_team_roles and dream_team_equipos share the
  // same read policy, so every visible role hangs from a visible equipo.
  const rolesPorEquipo: Readonly<Record<string, readonly DreamTeamRol[]>> =
    Object.fromEntries(
      equipos.map((equipo) => [
        equipo.id,
        todosLosRoles.filter((rol) => rol.equipoId === equipo.id),
      ]),
    );
  const roles = todosLosRoles;
  const rolLabelPorId = new Map(roles.map((rol) => [rol.id, rol.label]));

  const personaIds = [
    ...servicios.map((servicio) => servicio.personaId),
    ...lideresGdv.map((lider) => lider.personaId),
  ];
  const servicioIds = servicios.map((servicio) => servicio.id);

  // Second batch: everything keyed by the people and servicios of the first.
  // - Names: persona display names are not part of DreamTeamServicio and the
  //   repository has no join for them; one bulk lookup (personas.ts) avoids an
  //   N+1 and keeps usuarios (not a dream-team table) out of the repository.
  // - Contacts: phone and account status from a scoped RPC (`usuarios` has its
  //   own RLS); a persona missing from the map is "not visible to you" and is
  //   shown without phone or account mark, never as "sin cuenta".
  // - Age range (D10): scoped RPC, the birth date never leaves the database; a
  //   failure renders without the age pills and is logged.
  // - Frequency is display-only: a failed read shows every turno as weekly.
  // - Campus service shifts (D12): the filter's options and each servicio's
  //   assignment; if either read fails the page renders without the filter,
  //   and the failure is logged.
  // - Editar ficha: the people the database lets the viewer edit (an area
  //   director's, dream_team_fichas_editables, S5 of
  //   odd/tasks/dream-team-directores-fichas.md); fails closed to none.
  // - Cambiar de área: the equipos the viewer directs or coordinates
  //   (dream_team_puede_solicitar_cambio_area; a coordinator only requests).
  //   Fails closed; the RPCs check it again.
  const [
    personaNombrePorId,
    contactoPorId,
    rangoEdadPorId,
    fichasEditables,
    equiposCambioArea,
    frecuenciasPorServicio,
    [turnos, turnosPorServicio],
  ] = await Promise.all([
    fetchNombresPersonas(supabase, personaIds),
    fetchContactosPersonas(supabase, personaIds),
    fetchRangosEdad(supabase, personaIds).catch(
      (error: unknown): ReadonlyMap<PersonaId, RangoEdad> => {
        console.error("[dream-team/servidores] age lookup failed", error);
        return new Map();
      },
    ),
    fetchFichasEditables(
      rpcDeCliente(supabase),
      servicios.map((servicio) => servicio.personaId),
    ),
    fetchEquiposCambioArea(
      supabase,
      servicios
        .filter((servicio) => servicio.estado !== "retirado")
        .map((servicio) => servicio.equipoId),
    ),
    fetchFrecuenciasDeServicios(supabase, servicioIds).catch(
      () => new Map<string, never>(),
    ),
    Promise.all([
      fetchTurnos(supabase),
      fetchTurnosDeServicios(supabase, servicioIds),
    ]).catch(
      (error: unknown): [Turno[], ReadonlyMap<string, readonly string[]>] => {
        console.error("[dream-team/servidores] shifts lookup failed", error);
        return [[], new Map()];
      },
    ),
  ]);

  // Merge the real tree with the virtual Grupos de Vida branch (item 3) plus
  // who holds director/coordinador on each real node (item 4). This is what
  // makes a Grupos de Vida row's `equipoLabel` resolve to its group name
  // below — before this feature `equipoLabelPorId` only knew about real
  // equipos, so a GdV row (grouped under a group id, not a real equipo id)
  // always fell back to "Equipo no encontrado".
  const responsablesDreamTeam = responsablesDreamTeamPorEquipo(
    servicios,
    roles,
    personaNombrePorId,
  );
  const nodosCombinados = construirNodosArbol(
    equipos,
    nodosGdv,
    responsablesDreamTeam,
  );
  const arbol = construirArbol(nodosCombinados);

  const indice = indexarArbol(arbol);
  const ubicacion = (equipoId: string) => {
    const nodo = indice.get(equipoId);
    return {
      equipoLabel: nodo?.label ?? "Equipo no encontrado",
      equipoRuta: nodo?.ruta ?? "",
      direccionId: nodo?.direccionId ?? equipoId,
    };
  };
  const puedeEditar = hasDreamTeamWriteCapability(session);

  const filasBase: readonly FilaServidor[] = [
    ...servicios.map(
      (servicio): FilaServidor => ({
        clave: servicio.id,
        personaId: servicio.personaId,
        nombre:
          personaNombrePorId.get(servicio.personaId) ?? "Persona no encontrada",
        equipoId: servicio.equipoId,
        ...ubicacion(servicio.equipoId),
        rolLabel: rolLabel(
          rolLabelPorId.get(servicio.rolId) ?? "Rol no encontrado",
        ),
        estado: servicio.estado,
        fechaInicio: servicio.fechaInicio,
        telefono: contactoPorId.get(servicio.personaId)?.telefono ?? null,
        tieneCuenta: contactoPorId.get(servicio.personaId)?.tieneCuenta ?? null,
        origen: "dream_team",
        servicioId: servicio.id,
        version: servicio.version,
        editable: puedeEditar,
        fichaEditable:
          servicio.estado !== "retirado" &&
          (equiposFicha.has(servicio.equipoId) ||
            fichasEditables.has(servicio.personaId)),
        areaCambiable:
          servicio.estado !== "retirado" &&
          equiposCambioArea.has(servicio.equipoId),
        turnoIds: turnosPorServicio.get(servicio.id) ?? [],
        frecuencias: frecuenciasPorServicio.get(servicio.id),
        rangoEdad: rangoEdadPorId.get(servicio.personaId),
      }),
    ),
    ...lideresGdv.map(
      (lider): FilaServidor => ({
        clave: `gdv:${lider.personaId}:${lider.equipoId}`,
        personaId: lider.personaId,
        nombre:
          personaNombrePorId.get(lider.personaId) ?? "Persona no encontrada",
        equipoId: lider.equipoId,
        ...ubicacion(lider.equipoId),
        rolLabel: ROL_LIDER_GDV_LABELS[lider.rol],
        estado: "activo",
        fechaInicio: lider.desde,
        telefono: contactoPorId.get(lider.personaId)?.telefono ?? null,
        tieneCuenta: contactoPorId.get(lider.personaId)?.tieneCuenta ?? null,
        origen: "grupos_vida",
        editable: false,
        rangoEdad: rangoEdadPorId.get(lider.personaId),
      }),
    ),
  ];

  // Invitations to register (invitaciones pendientes): only those of the fichas
  // the caller may invite, as the database decides; the same answer gates
  // Invitar (`invitable`, S5 of odd/tasks/dream-team-directores-invitan.md). A
  // convenience: if the lookup fails the page renders without the account-state
  // pills and the ficha decides Invitar, as before.
  const invitaciones = await fetchInvitacionesServidores(
    rpcDeCliente(supabase),
    filasBase.map((fila) => fila.personaId),
    new Date(),
  );
  const filas = adjuntarInvitaciones(filasBase, invitaciones);

  const parametros: ParametrosDeUrl = (await searchParams) ?? {};

  return (
    <ServidoresClient
      filas={filas}
      arbol={arbol}
      rolesPorEquipo={rolesPorEquipo}
      puedeEditar={puedeEditar}
      filtrosIniciales={leerFiltrosDeUrl(parametros)}
      turnos={turnos.filter((turno) => turno.activo)}
    />
  );
}
