/**
 * S16 — Resources API route.
 * GET  /api/operating-core/resources  — list resources
 * POST /api/operating-core/resources  — create resource
 * PATCH /api/operating-core/resources — transfer ownership / archive
 *
 * Threat matrix:
 * - Flag off → 404
 * - Missing auth → 401
 * - Missing resources.manage capability → 403
 * - Invalid body → 400
 * - Transfer no-op (same scope) → 400
 * - Business outcomes never → 500
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  isOperatingCoreEnabled,
  requireOperatingCoreSession,
  hasOperatingCoreResourcesManageCapability,
} from '@/lib/platform/operating-core'
import { createOperatingCoreResourcesRepository } from '@/lib/platform/operating-core/resources/factory'
import { validateCreateInput, buildSuccessorFromTransfer } from '@/lib/platform/operating-core/resources/resource-state'
import { OPERATING_CORE_RESOURCE_KINDS } from '@/lib/platform/operating-core/resources/resource-types'
import type { CreateResourceInput, ResourceTransferRequest, ResourceArchiveRequest } from '@/lib/platform/operating-core/resources/resource-types'
import type { OperatingCoreResourceKind } from '@/lib/platform/operating-core/resources/resource-types'

// ─── GET /resources ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // 1. Flag check
  if (!isOperatingCoreEnabled()) {
    return NextResponse.json({ error: 'Operating Core is not enabled' }, { status: 404 })
  }

  // 2. Auth
  const session = await requireOperatingCoreSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 3. Capability
  if (!hasOperatingCoreResourcesManageCapability(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 4. Parse query params
  const url = new URL(req.url)
  const kind = url.searchParams.get('kind') as OperatingCoreResourceKind | null
  const area_experience_id = url.searchParams.get('area_experience_id')
  const category = url.searchParams.get('category')
  const tag = url.searchParams.get('tag')
  const includeArchived = url.searchParams.get('includeArchived') === 'true'

  if (kind && !OPERATING_CORE_RESOURCE_KINDS.includes(kind)) {
    return NextResponse.json({ error: 'Invalid kind value' }, { status: 400 })
  }

  // 5. List resources
  const repo = createOperatingCoreResourcesRepository()
  const resources = await repo.list({
    ...(kind && { kind }),
    ...(area_experience_id && { area_experience_id }),
    ...(category && { category }),
    ...(tag && { tag }),
    ...(includeArchived && { includeArchived }),
  })

  // 6. Return (NO internal IDs leaked beyond created_by_persona_id)
  return NextResponse.json({ resources }, { status: 200 })
}

// ─── POST /resources ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Flag check
  if (!isOperatingCoreEnabled()) {
    return NextResponse.json({ error: 'Operating Core is not enabled' }, { status: 404 })
  }

  // 2. Auth
  const session = await requireOperatingCoreSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 3. Capability
  if (!hasOperatingCoreResourcesManageCapability(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 4. Parse body
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { kind, title, description, category, tags, area_experience_id, visible_to_roles, visible_to_capabilities } = body

  if (!kind || typeof kind !== 'string') {
    return NextResponse.json({ error: 'kind is required' }, { status: 400 })
  }

  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  if (!category || typeof category !== 'string') {
    return NextResponse.json({ error: 'category is required' }, { status: 400 })
  }

  if (!area_experience_id || typeof area_experience_id !== 'string') {
    return NextResponse.json({ error: 'area_experience_id is required' }, { status: 400 })
  }

  // Validate kind via state machine
  const validation = validateCreateInput({
    kind: kind as OperatingCoreResourceKind,
    title: title as string,
    category: category as string,
    area_experience_id: area_experience_id as string,
    created_by_persona_id: session.personaId,
    current_iso_timestamp: new Date().toISOString(),
    ...(description !== undefined && { description: description as string }),
    ...(tags !== undefined && { tags: tags as readonly string[] }),
    ...(visible_to_roles !== undefined && { visible_to_roles: visible_to_roles as readonly string[] }),
    ...(visible_to_capabilities !== undefined && { visible_to_capabilities: visible_to_capabilities as readonly string[] }),
  })

  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  // 5. Create resource
  const repo = createOperatingCoreResourcesRepository()
  const input: CreateResourceInput = {
    kind: kind as OperatingCoreResourceKind,
    title: title as string,
    description: description as string | undefined,
    category: category as string,
    tags: tags as readonly string[] | undefined,
    area_experience_id: area_experience_id as string,
    visible_to_roles: (visible_to_roles as readonly string[]) ?? [],
    visible_to_capabilities: (visible_to_capabilities as readonly string[]) ?? [],
    created_by_persona_id: session.personaId,
    current_iso_timestamp: new Date().toISOString(),
  }

  const resource = await repo.create(input)

  // 6. Return 201
  return NextResponse.json({ resource }, { status: 201 })
}

// ─── PATCH /resources ─────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  // 1. Flag check
  if (!isOperatingCoreEnabled()) {
    return NextResponse.json({ error: 'Operating Core is not enabled' }, { status: 404 })
  }

  // 2. Auth
  const session = await requireOperatingCoreSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 3. Capability
  if (!hasOperatingCoreResourcesManageCapability(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 4. Parse body
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { resource_id, action } = body

  if (!resource_id || typeof resource_id !== 'string') {
    return NextResponse.json({ error: 'resource_id is required' }, { status: 400 })
  }

  if (!action || typeof action !== 'string') {
    return NextResponse.json({ error: 'action is required' }, { status: 400 })
  }

  const repo = createOperatingCoreResourcesRepository()

  if (action === 'transfer') {
    const { new_area_experience_id, new_visible_to_roles, new_visible_to_capabilities, actor_persona_id, current_iso_timestamp } = body

    if (!new_area_experience_id || typeof new_area_experience_id !== 'string') {
      return NextResponse.json({ error: 'new_area_experience_id is required' }, { status: 400 })
    }

    if (!Array.isArray(new_visible_to_roles)) {
      return NextResponse.json({ error: 'new_visible_to_roles must be an array' }, { status: 400 })
    }

    if (!Array.isArray(new_visible_to_capabilities)) {
      return NextResponse.json({ error: 'new_visible_to_capabilities must be an array' }, { status: 400 })
    }

    const transferRequest: ResourceTransferRequest = {
      resource_id: resource_id as string,
      new_area_experience_id: new_area_experience_id as string,
      new_visible_to_roles: new_visible_to_roles as readonly string[],
      new_visible_to_capabilities: new_visible_to_capabilities as readonly string[],
      actor_persona_id: (actor_persona_id as string) ?? session.personaId,
      current_iso_timestamp: (current_iso_timestamp as string) ?? new Date().toISOString(),
    }

    // Pre-validate to catch no-op transfers
    const current = await repo.findById(resource_id as string)
    if (!current) {
      return NextResponse.json({ error: 'resource_not_found' }, { status: 400 })
    }

    const preValidate = buildSuccessorFromTransfer(current, transferRequest)
    if (!preValidate.success) {
      return NextResponse.json({ error: preValidate.error }, { status: 400 })
    }

    const result = await repo.transferOwnership(transferRequest)
    return NextResponse.json({ successor: result.successor, archived: result.archived }, { status: 200 })
  }

  if (action === 'archive') {
    const { actor_persona_id, current_iso_timestamp, reason } = body

    if (!actor_persona_id || typeof actor_persona_id !== 'string') {
      return NextResponse.json({ error: 'actor_persona_id is required' }, { status: 400 })
    }

    if (!current_iso_timestamp || typeof current_iso_timestamp !== 'string') {
      return NextResponse.json({ error: 'current_iso_timestamp is required' }, { status: 400 })
    }

    if (!reason || typeof reason !== 'string') {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 })
    }

    const archiveRequest: ResourceArchiveRequest = {
      resource_id: resource_id as string,
      actor_persona_id: actor_persona_id as string,
      current_iso_timestamp: current_iso_timestamp as string,
      reason: reason as string,
    }

    try {
      const resource = await repo.archive(archiveRequest)
      return NextResponse.json({ resource }, { status: 200 })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'resource_not_found') {
          return NextResponse.json({ error: 'resource_not_found' }, { status: 400 })
        }
        if (error.message === 'resource_archived') {
          return NextResponse.json({ error: 'resource_archived' }, { status: 400 })
        }
      }
      throw error
    }
  }

  return NextResponse.json({ error: 'Unknown action. Use "transfer" or "archive".' }, { status: 400 })
}
