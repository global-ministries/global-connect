import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  canEditUserByScopeModel,
  shouldShowEditAction,
  toPermissionRpcValue,
} from "@/app/(auth)/users/[id]/user-edit-permission"
import type { UserEditPermissionModelInput } from "@/app/(auth)/users/[id]/user-edit-permission"

describe("user detail edit visibility", () => {
  it("shows edit only when RPC permission is explicitly true", () => {
    expect(shouldShowEditAction(toPermissionRpcValue(true))).toBe(true)
    expect(shouldShowEditAction(toPermissionRpcValue(false))).toBe(false)
  })

  it("fails closed when RPC result is unknown or missing", () => {
    expect(shouldShowEditAction(toPermissionRpcValue(null))).toBe(false)
    expect(shouldShowEditAction(toPermissionRpcValue(undefined))).toBe(false)
  })
})

describe("puede_editar_usuario migration contract", () => {
  const migrationPath = resolve(
    process.cwd(),
    "supabase/migrations/20260327_001_puede_editar_usuario.sql",
  )
  const sql = readFileSync(migrationPath, "utf8")

  it("keeps admin, pastor and self allow paths", () => {
    expect(sql).toContain("IF v_actor_id = p_target_user_id THEN")
    expect(sql).toContain("rs.nombre_interno IN ('admin', 'pastor')")
  })

  it("enforces scoped leader, director-etapa and director-general checks", () => {
    expect(sql).toContain("gm_actor.rol = 'Líder'")
    expect(sql).toContain("sl.tipo_lider = 'director_etapa'")
    expect(sql).toContain("public.es_director_general_de_grupo")
    expect(sql).toContain("g.activo = true")
    expect(sql).toContain("g.eliminado = false")
    expect(sql).toContain("gm_objetivo.fecha_salida IS NULL")
  })
})

describe("puede_editar_usuario semantic model", () => {
  const activeContext: UserEditPermissionModelInput = {
    actorId: "actor-1",
    actorAuthId: "auth-actor-1",
    targetUserId: "target-1",
    targetExists: true,
    actorExists: true,
    actorSystemRoles: [] as string[],
    memberships: [
      {
        userId: "actor-1",
        groupId: "group-a",
        role: "Líder",
        estado: "activo",
        fechaSalida: null,
      },
      {
        userId: "target-1",
        groupId: "group-a",
        role: "Miembro",
        estado: "activo",
        fechaSalida: null,
      },
    ],
    groups: [{ id: "group-a", activo: true, eliminado: false }],
    directorEtapaAssignments: [],
    segmentoLideres: [],
    directorGeneralAllowedGroupIds: [],
  }

  it("allows admin, pastor and self", () => {
    expect(
      canEditUserByScopeModel({
        ...activeContext,
        actorSystemRoles: ["admin"],
      }),
    ).toBe(true)
    expect(
      canEditUserByScopeModel({
        ...activeContext,
        actorSystemRoles: ["pastor"],
      }),
    ).toBe(true)
    expect(
      canEditUserByScopeModel({
        ...activeContext,
        targetUserId: "actor-1",
      }),
    ).toBe(true)
  })

  it("allows leader only in same active group and denies outside/inactive", () => {
    expect(canEditUserByScopeModel(activeContext)).toBe(true)

    expect(
      canEditUserByScopeModel({
        ...activeContext,
        memberships: [
          activeContext.memberships[0],
          {
            userId: "target-1",
            groupId: "group-b",
            role: "Miembro",
            estado: "activo",
            fechaSalida: null,
          },
        ],
        groups: [
          { id: "group-a", activo: true, eliminado: false },
          { id: "group-b", activo: true, eliminado: false },
        ],
      }),
    ).toBe(false)

    expect(
      canEditUserByScopeModel({
        ...activeContext,
        groups: [{ id: "group-a", activo: false, eliminado: false }],
      }),
    ).toBe(false)
  })

  it("denies leader when target user is inactive even with overlapping group", () => {
    expect(
      canEditUserByScopeModel({
        ...activeContext,
        memberships: [
          activeContext.memberships[0],
          {
            userId: "target-1",
            groupId: "group-a",
            role: "Miembro",
            estado: "inactivo",
            fechaSalida: null,
          },
        ],
      }),
    ).toBe(false)
  })

  it("allows director-etapa only in assigned groups", () => {
    expect(
      canEditUserByScopeModel({
        ...activeContext,
        memberships: [
          {
            userId: "target-1",
            groupId: "group-a",
            role: "Miembro",
            estado: "activo",
            fechaSalida: null,
          },
        ],
        directorEtapaAssignments: [{ directorEtapaId: "de-1", groupId: "group-a" }],
        segmentoLideres: [
          { id: "de-1", userId: "actor-1", tipoLider: "director_etapa" },
        ],
      }),
    ).toBe(true)

    expect(
      canEditUserByScopeModel({
        ...activeContext,
        memberships: [
          {
            userId: "target-1",
            groupId: "group-b",
            role: "Miembro",
            estado: "activo",
            fechaSalida: null,
          },
        ],
        groups: [{ id: "group-b", activo: true, eliminado: false }],
        directorEtapaAssignments: [{ directorEtapaId: "de-1", groupId: "group-a" }],
        segmentoLideres: [
          { id: "de-1", userId: "actor-1", tipoLider: "director_etapa" },
        ],
      }),
    ).toBe(false)
  })

  it("allows scoped director-general and denies global broadening", () => {
    expect(
      canEditUserByScopeModel({
        ...activeContext,
        memberships: [
          {
            userId: "target-1",
            groupId: "group-a",
            role: "Miembro",
            estado: "activo",
            fechaSalida: null,
          },
        ],
        directorGeneralAllowedGroupIds: ["group-a"],
      }),
    ).toBe(true)

    expect(
      canEditUserByScopeModel({
        ...activeContext,
        memberships: [
          {
            userId: "target-1",
            groupId: "group-b",
            role: "Miembro",
            estado: "activo",
            fechaSalida: null,
          },
        ],
        groups: [{ id: "group-b", activo: true, eliminado: false }],
        directorGeneralAllowedGroupIds: ["group-a"],
      }),
    ).toBe(false)
  })

  it("enforces DG narrowing through dg_directores_etapa when assignments exist", () => {
    expect(
      canEditUserByScopeModel({
        ...activeContext,
        memberships: [
          {
            userId: "target-1",
            groupId: "group-a",
            role: "Miembro",
            estado: "activo",
            fechaSalida: null,
          },
        ],
        directorGeneralAllowedGroupIds: ["group-a"],
        directorGeneralHasAssignedDirectoresEtapa: true,
        directorGeneralAssignedDirectoresEtapaGroupIds: ["group-b"],
      }),
    ).toBe(false)
  })
})
