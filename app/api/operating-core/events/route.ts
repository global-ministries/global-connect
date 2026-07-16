/**
 * Events API routes — list and create.
 * Deny-by-default: flag → auth → capability → body → concurrency.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  isOperatingCoreEnabled,
  requireOperatingCoreSession,
  hasOperatingCoreEventsReadCapability,
  hasOperatingCoreEventsWriteCapability,
} from '@/lib/platform/operating-core/route-access'
import { createOperatingCoreEventsRepository } from '@/lib/platform/operating-core/repositories/factory'
import { OperatingCoreConcurrencyConflictError } from '@/lib/platform/operating-core/errors'
import type { OperatingCoreEventKind } from '@/lib/platform/operating-core/types'
import type { CreateEventInput } from '@/lib/platform/operating-core/repositories/events-repository'

const VALID_KINDS: readonly OperatingCoreEventKind[] = ['service', 'group_meeting', 'workshop', 'activity', 'custom']

const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 })

function parseCreateBody(body: unknown): { input: CreateEventInput } | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Body inválido' }
  const b = body as Record<string, unknown>
  const { kind, title, startTime, visibilityScope, serviceId, recurrenceRule, parentEventId } = b
  if (typeof kind !== 'string' || !VALID_KINDS.includes(kind as OperatingCoreEventKind)) return { error: `kind debe ser uno de: ${VALID_KINDS.join(', ')}` }
  if (typeof title !== 'string' || !title.trim()) return { error: 'title es requerido' }
  if (typeof startTime !== 'string' || !startTime.trim()) return { error: 'startTime es requerido' }
  if (typeof visibilityScope !== 'string' || !visibilityScope.trim()) return { error: 'visibilityScope es requerido' }
  const safeServiceId = typeof serviceId === 'string' ? serviceId : null
  const safeRecurrenceRule = recurrenceRule != null && typeof recurrenceRule === 'object' ? recurrenceRule as CreateEventInput['recurrenceRule'] : null
  const safeParentEventId = typeof parentEventId === 'string' ? parentEventId : null
  return {
    input: {
      kind: kind as CreateEventInput['kind'],
      title: title.trim(),
      startTime: startTime.trim(),
      visibilityScope: visibilityScope.trim(),
      serviceId: safeServiceId,
      recurrenceRule: safeRecurrenceRule,
      parentEventId: safeParentEventId,
    },
  }
}

export async function GET(_req: NextRequest) {
  try {
    if (!isOperatingCoreEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const s = await requireOperatingCoreSession()
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (!hasOperatingCoreEventsReadCapability(s)) return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    const repo = createOperatingCoreEventsRepository()
    const events = await repo.list()
    return NextResponse.json({ events })
  } catch (error) {
    console.error('[operating-core/events] GET error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isOperatingCoreEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const s = await requireOperatingCoreSession()
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (!hasOperatingCoreEventsWriteCapability(s)) return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    let body: unknown
    try { body = await req.json() } catch { return bad('Body inválido') }
    const parsed = parseCreateBody(body)
    if ('error' in parsed) return bad(parsed.error)
    const repo = createOperatingCoreEventsRepository()
    const event = await repo.create(parsed.input)
    return NextResponse.json({ event }, { status: 201 })
  } catch (error) {
    if (error instanceof OperatingCoreConcurrencyConflictError) {
      return NextResponse.json({ error: 'Conflicto de concurrencia' }, { status: 409 })
    }
    console.error('[operating-core/events] POST error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
