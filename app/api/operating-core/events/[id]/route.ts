/**
 * Event by ID — get, update, cancel.
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
import type { OperatingCoreEventEstado } from '@/lib/platform/operating-core/types'

const VALID_ESTADOS: readonly OperatingCoreEventEstado[] = ['active', 'cancelled']

const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 })

type RouteCtx = { params: Promise<{ id: string }> | { id: string } }
const resolveId = async (ctx: RouteCtx) => ('then' in ctx.params ? await ctx.params : ctx.params).id

export async function GET(req: NextRequest, ctx: RouteCtx) {
  try {
    if (!isOperatingCoreEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const s = await requireOperatingCoreSession()
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (!hasOperatingCoreEventsReadCapability(s)) return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    const id = await resolveId(ctx)
    const repo = createOperatingCoreEventsRepository()
    const event = await repo.findById(id)
    if (!event) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })
    return NextResponse.json({ event })
  } catch (error) {
    console.error('[operating-core/events/[id]] GET error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  try {
    if (!isOperatingCoreEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const s = await requireOperatingCoreSession()
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (!hasOperatingCoreEventsWriteCapability(s)) return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    const id = await resolveId(ctx)
    let body: unknown
    try { body = await req.json() } catch { return bad('Body inválido') }
    if (!body || typeof body !== 'object') return bad('Body inválido')
    const b = body as Record<string, unknown>
    const { title, startTime, visibilityScope, estado, version } = b
    if (version === undefined || typeof version !== 'number') return bad('version es requerido (number)')
    const patch: Record<string, unknown> = {}
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) return bad('title debe ser un string no vacío')
      patch.title = title.trim()
    }
    if (startTime !== undefined) {
      if (typeof startTime !== 'string' || !startTime.trim()) return bad('startTime debe ser un string no vacío')
      patch.startTime = startTime.trim()
    }
    if (visibilityScope !== undefined) {
      if (typeof visibilityScope !== 'string' || !visibilityScope.trim()) return bad('visibilityScope debe ser un string no vacío')
      patch.visibilityScope = visibilityScope.trim()
    }
    if (estado !== undefined) {
      if (!VALID_ESTADOS.includes(estado as OperatingCoreEventEstado)) return bad(`estado debe ser uno de: ${VALID_ESTADOS.join(', ')}`)
      patch.estado = estado
    }
    const repo = createOperatingCoreEventsRepository()
    try {
      const event = await repo.update(id, version, patch as Parameters<typeof repo.update>[2])
      return NextResponse.json({ event })
    } catch (error) {
      if (error instanceof OperatingCoreConcurrencyConflictError) return NextResponse.json({ error: 'Conflicto de concurrencia' }, { status: 409 })
      const existing = await repo.findById(id)
      if (!existing) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })
      throw error
    }
  } catch (error) {
    if (error instanceof OperatingCoreConcurrencyConflictError) return NextResponse.json({ error: 'Conflicto de concurrencia' }, { status: 409 })
    console.error('[operating-core/events/[id]] PATCH error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  try {
    if (!isOperatingCoreEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const s = await requireOperatingCoreSession()
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (!hasOperatingCoreEventsWriteCapability(s)) return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    const id = await resolveId(ctx)
    let body: unknown
    try { body = await req.json() } catch { return bad('Body inválido') }
    if (!body || typeof body !== 'object') return bad('Body inválido')
    const b = body as Record<string, unknown>
    const { action, motivo } = b
    if (action !== 'cancel') return bad('action debe ser "cancel"')
    if (typeof motivo !== 'string' || !motivo.trim()) return bad('motivo es requerido')
    const repo = createOperatingCoreEventsRepository()
    const existing = await repo.findById(id)
    if (!existing) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })
    await repo.cancel(id, motivo.trim(), s.personaId)
    const updated = await repo.findById(id)
    return NextResponse.json({ event: updated })
  } catch (error) {
    console.error('[operating-core/events/[id]] POST error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
