/**
 * Services API routes — list and create.
 * Deny-by-default: flag → auth → capability → body → concurrency.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  isOperatingCoreEnabled,
  requireOperatingCoreSession,
  hasOperatingCoreServicesReadCapability,
  hasOperatingCoreServicesWriteCapability,
} from '@/lib/platform/operating-core/route-access'
import { createOperatingCoreServicesRepository } from '@/lib/platform/operating-core/repositories/factory'
import { OperatingCoreConcurrencyConflictError } from '@/lib/platform/operating-core/errors'
import type { CreateServiceInput } from '@/lib/platform/operating-core/repositories/services-repository'

const VALID_KINDS = ['service', 'group_meeting', 'workshop', 'activity', 'custom'] as const

const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 })

function parseCreateBody(body: unknown): { input: CreateServiceInput } | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Body inválido' }
  const b = body as Record<string, unknown>
  const { campusId, kind, label, weekday, startTime } = b
  if (typeof campusId !== 'string' || !campusId.trim()) return { error: 'campusId es requerido' }
  if (typeof kind !== 'string' || !VALID_KINDS.includes(kind as typeof VALID_KINDS[number])) return { error: `kind debe ser uno de: ${VALID_KINDS.join(', ')}` }
  if (typeof label !== 'string' || !label.trim()) return { error: 'label es requerido' }
  if (typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) return { error: 'weekday debe ser un entero 0-6' }
  if (typeof startTime !== 'string' || !/^\d{2}:\d{2}$/.test(startTime.trim())) return { error: 'startTime debe ser HH:mm' }
  return {
    input: {
      campusId: campusId.trim(),
      kind: kind as CreateServiceInput['kind'],
      label: label.trim(),
      weekday,
      startTime: startTime.trim(),
    },
  }
}

export async function GET(_req: NextRequest) {
  try {
    if (!isOperatingCoreEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const s = await requireOperatingCoreSession()
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (!hasOperatingCoreServicesReadCapability(s)) return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    const repo = createOperatingCoreServicesRepository()
    const services = await repo.list()
    return NextResponse.json({ services })
  } catch (error) {
    console.error('[operating-core/services] GET error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isOperatingCoreEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const s = await requireOperatingCoreSession()
    if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (!hasOperatingCoreServicesWriteCapability(s)) return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    let body: unknown
    try { body = await req.json() } catch { return bad('Body inválido') }
    const parsed = parseCreateBody(body)
    if ('error' in parsed) return bad(parsed.error)
    const repo = createOperatingCoreServicesRepository()
    try {
      const service = await repo.create(parsed.input)
      return NextResponse.json({ service }, { status: 201 })
    } catch (error) {
      if (error instanceof OperatingCoreConcurrencyConflictError) return NextResponse.json({ error: 'Conflicto de concurrencia' }, { status: 409 })
      throw error
    }
  } catch (error) {
    console.error('[operating-core/services] POST error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
