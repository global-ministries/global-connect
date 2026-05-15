export type PermissionRpcValue = boolean | null

type MembershipRole = "Líder" | "Miembro"
type MembershipState = "activo" | "inactivo"

export type PermissionMembership = {
  userId: string
  groupId: string
  role: MembershipRole
  estado: MembershipState
  fechaSalida: string | null
}

export type PermissionGroup = {
  id: string
  activo: boolean
  eliminado: boolean
}

export type DirectorEtapaAssignment = {
  directorEtapaId: string
  groupId: string
}

export type SegmentoLider = {
  id: string
  userId: string
  tipoLider: "director_etapa"
}

export type UserEditPermissionModelInput = {
  actorId: string
  actorAuthId: string
  targetUserId: string
  targetExists: boolean
  actorExists: boolean
  actorSystemRoles: string[]
  memberships: PermissionMembership[]
  groups: PermissionGroup[]
  directorEtapaAssignments: DirectorEtapaAssignment[]
  segmentoLideres: SegmentoLider[]
  directorGeneralAllowedGroupIds: string[]
  directorGeneralHasAssignedDirectoresEtapa?: boolean
  directorGeneralAssignedDirectoresEtapaGroupIds?: string[]
}

export function toPermissionRpcValue(value: unknown): PermissionRpcValue {
  return value === true ? true : false
}

export function shouldShowEditAction(permission: PermissionRpcValue): boolean {
  return permission === true
}

export function canEditUserByScopeModel(input: UserEditPermissionModelInput): boolean {
  if (!input.actorExists || !input.targetExists) {
    return false
  }

  if (input.actorId === input.targetUserId) {
    return true
  }

  if (input.actorSystemRoles.includes("admin") || input.actorSystemRoles.includes("pastor")) {
    return true
  }

  const activeGroupIds = new Set(
    input.groups.filter((group) => group.activo && !group.eliminado).map((group) => group.id),
  )

  const isActiveMembership = (membership: PermissionMembership): boolean =>
    membership.estado === "activo" && membership.fechaSalida === null && activeGroupIds.has(membership.groupId)

  const actorLeaderGroupIds = new Set(
    input.memberships
      .filter((membership) => membership.userId === input.actorId)
      .filter(isActiveMembership)
      .filter((membership) => membership.role === "Líder")
      .map((membership) => membership.groupId),
  )

  const targetActiveGroupIds = new Set(
    input.memberships
      .filter((membership) => membership.userId === input.targetUserId)
      .filter(isActiveMembership)
      .map((membership) => membership.groupId),
  )

  for (const groupId of actorLeaderGroupIds) {
    if (targetActiveGroupIds.has(groupId)) {
      return true
    }
  }

  const directorEtapaIds = new Set(
    input.segmentoLideres
      .filter((segmento) => segmento.userId === input.actorId && segmento.tipoLider === "director_etapa")
      .map((segmento) => segmento.id),
  )

  const directorEtapaGroupIds = new Set(
    input.directorEtapaAssignments
      .filter((assignment) => directorEtapaIds.has(assignment.directorEtapaId))
      .map((assignment) => assignment.groupId),
  )

  for (const groupId of targetActiveGroupIds) {
    if (directorEtapaGroupIds.has(groupId)) {
      return true
    }
  }

  const dgScopeGroupIds = new Set(input.directorGeneralAllowedGroupIds)
  const hasAssignedDirectoresEtapa = input.directorGeneralHasAssignedDirectoresEtapa === true
  const dgAssignedDirectoresEtapaGroupIds = new Set(
    input.directorGeneralAssignedDirectoresEtapaGroupIds ?? [],
  )

  for (const groupId of targetActiveGroupIds) {
    if (!dgScopeGroupIds.has(groupId)) {
      continue
    }

    if (hasAssignedDirectoresEtapa && !dgAssignedDirectoresEtapaGroupIds.has(groupId)) {
      continue
    }

      return true
  }

  return false
}
