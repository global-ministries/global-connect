import { normalizePlatformScopeId } from '@/lib/platform/experiences'
import type { PlatformSession, PlatformSessionCapability, PlatformSessionContext } from '@/lib/platform/session/types'

export type GruposVidaDirectorEtapaAssignment = {
  directorEtapaId: string
  personaId: string
  segmentoId: string
  segmentoLabel: string | null
  assignedGroupIds: readonly string[]
}

export type GruposVidaReadRepository = {
  findDirectorEtapaAssignmentsByPersonaId(personaId: string): Promise<readonly GruposVidaDirectorEtapaAssignment[]>
}

export type GruposVidaAdapterInput = {
  session: PlatformSession | null | undefined
  reader: GruposVidaReadRepository
}

export type GruposVidaAuthorizedScope = { stageIds: string[]; groupIds: string[] }
export type GruposVidaAdapterDeniedReason = 'session_required' | 'adapter_read_failed' | 'missing_gdv_scope' | 'invalid_gdv_scope'
export type GruposVidaAdapterAudit = {
  decision: 'allowed' | 'denied'
  reason?: GruposVidaAdapterDeniedReason
  personaId?: string
  assignmentCount: number
  exposedGroupCount: number
}

export type GruposVidaAdapterResult =
  | { ok: true; contexts: PlatformSessionContext[]; capabilities: PlatformSessionCapability[]; scope: GruposVidaAuthorizedScope; audit: GruposVidaAdapterAudit }
  | { ok: false; reason: GruposVidaAdapterDeniedReason; contexts: []; capabilities: []; scope: GruposVidaAuthorizedScope; audit: GruposVidaAdapterAudit }

type NormalizedDirectorAssignment = { stageId: string; label: string; groupIds: string[] }

const GDV_STAGE_READ_CAPABILITY = 'grupos_vida.stage.read'
const GDV_CONTEXT_SOURCE = 'gdv:director_etapa'

export async function resolveGruposVidaPlatformContext(input: GruposVidaAdapterInput): Promise<GruposVidaAdapterResult> {
  const personaId = normalizePlatformScopeId(input.session?.personaId)
  if (!personaId || !input.session?.subjectAuthId.trim()) {
    return denied('session_required', personaId)
  }

  let assignments: readonly GruposVidaDirectorEtapaAssignment[]
  try {
    assignments = await input.reader.findDirectorEtapaAssignmentsByPersonaId(personaId)
  } catch {
    return denied('adapter_read_failed', personaId)
  }

  const normalizedAssignments = normalizeDirectorAssignments(assignments, personaId)
  if (!normalizedAssignments) {
    return denied('invalid_gdv_scope', personaId)
  }
  if (normalizedAssignments.length === 0) {
    return denied('missing_gdv_scope', personaId)
  }

  const scope = toAuthorizedScope(normalizedAssignments)
  return {
    ok: true,
    contexts: normalizedAssignments.map(toPlatformContext),
    capabilities: normalizedAssignments.map(toPlatformCapability),
    scope,
    audit: { decision: 'allowed', personaId, assignmentCount: normalizedAssignments.length, exposedGroupCount: scope.groupIds.length },
  }
}

export function canReadGruposVidaGroup(scope: GruposVidaAuthorizedScope, groupId: string | null | undefined): boolean {
  const normalizedGroupId = normalizePlatformScopeId(groupId)
  return Boolean(normalizedGroupId && new Set(scope.groupIds).has(normalizedGroupId))
}

export function filterGruposVidaRecordsByScope<T>(scope: GruposVidaAuthorizedScope, records: readonly T[], selectGroupId: (record: T) => string | null | undefined): T[] {
  const allowedGroupIds = new Set(scope.groupIds)
  return records.filter((record) => {
    const groupId = normalizePlatformScopeId(selectGroupId(record))
    return Boolean(groupId && allowedGroupIds.has(groupId))
  })
}

function normalizeDirectorAssignments(assignments: readonly GruposVidaDirectorEtapaAssignment[], personaId: string): NormalizedDirectorAssignment[] | null {
  const byStageId = new Map<string, NormalizedDirectorAssignment>()
  for (const assignment of assignments) {
    const assignmentPersonaId = normalizePlatformScopeId(assignment.personaId)
    const directorEtapaId = normalizePlatformScopeId(assignment.directorEtapaId)
    const stageId = normalizePlatformScopeId(assignment.segmentoId)
    const groupIds = normalizeGroupIds(assignment.assignedGroupIds)
    if (!assignmentPersonaId || assignmentPersonaId !== personaId || !directorEtapaId || !stageId || !groupIds) {
      return null
    }

    const existing = byStageId.get(stageId)
    const mergedGroupIds = uniqueSorted([...(existing?.groupIds ?? []), ...groupIds])
    byStageId.set(stageId, { stageId, label: formatStageLabel(assignment.segmentoLabel, stageId), groupIds: mergedGroupIds })
  }
  return [...byStageId.values()].sort((left, right) => left.stageId.localeCompare(right.stageId))
}

function normalizeGroupIds(groupIds: readonly string[]): string[] | null {
  const normalizedGroupIds: string[] = []
  for (const groupId of groupIds) {
    const normalizedGroupId = normalizePlatformScopeId(groupId)
    if (!normalizedGroupId) return null
    normalizedGroupIds.push(normalizedGroupId)
  }
  return normalizedGroupIds.length > 0 ? uniqueSorted(normalizedGroupIds) : null
}

function toAuthorizedScope(assignments: readonly NormalizedDirectorAssignment[]): GruposVidaAuthorizedScope {
  return {
    stageIds: assignments.map((assignment) => assignment.stageId),
    groupIds: uniqueSorted(assignments.flatMap((assignment) => assignment.groupIds)),
  }
}

function toPlatformContext(assignment: NormalizedDirectorAssignment): PlatformSessionContext {
  return { experience: 'grupos_vida', scopeType: 'etapa', scopeId: assignment.stageId, label: assignment.label }
}

function toPlatformCapability(assignment: NormalizedDirectorAssignment): PlatformSessionCapability {
  return { key: GDV_STAGE_READ_CAPABILITY, experience: 'grupos_vida', scopeType: 'etapa', scopeId: assignment.stageId, source: GDV_CONTEXT_SOURCE }
}

function denied(reason: GruposVidaAdapterDeniedReason, personaId?: string): GruposVidaAdapterResult {
  return {
    ok: false,
    reason,
    contexts: [],
    capabilities: [],
    scope: { stageIds: [], groupIds: [] },
    audit: { decision: 'denied', reason, ...(personaId ? { personaId } : {}), assignmentCount: 0, exposedGroupCount: 0 },
  }
}

function formatStageLabel(label: string | null, stageId: string): string {
  const cleanLabel = label?.trim()
  return `Grupos de Vida — ${cleanLabel || stageId}`
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}
