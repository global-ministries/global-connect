/**
 * W17 — DT-003 — GET /api/pastoral/admin/usuarios
 *
 * Returns all usuarios with their pastoral capabilities.
 * Auth: requires pastoral.admin.manage or pastoral.read.all.
 *
 * Response: 200 with array of {
 *   id, email, nombre, apellido, auth_id,
 *   capabilities: [{ capability_key, granted_at, revoked_at | null }]
 * }
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  isPastoralRouteEnabled,
  requirePastoralSession,
  hasPastoralAdminManageCapability,
  hasPastoralReadAllCapability,
} from '@/lib/platform/pastoral/route-access'
import { createSupabaseServerClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<Record<string, string>>
}

type UsuarioRow = {
  id: string
  email: string
  nombre: string
  apellido: string
  auth_id: string
}

type GrantRow = {
  persona_id: string
  capability_key: string
  granted_at: string | null
  revoked_at: string | null
}

type CapabilityEntry = {
  capability_key: string
  granted_at: string | null
  revoked_at: string | null
}

type UsuarioResponse = {
  id: string
  email: string
  nombre: string
  apellido: string
  auth_id: string
  capabilities: CapabilityEntry[]
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    if (!isPastoralRouteEnabled()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const session = await requirePastoralSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    if (!hasPastoralAdminManageCapability(session) && !hasPastoralReadAllCapability(session)) {
      return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    }

    const supabase = await createSupabaseServerClient()

    // Fetch all personas with pastoral capabilities (those that have at least one grant starting with 'pastoral.')
    const { data: personas, error: personasError } = await supabase
      .from('personas')
      .select('id, email, nombre, apellido, auth_id')
      .order('apellido', { ascending: true })

    if (personasError) {
      console.error('[pastoral/admin/usuarios GET] personas error:', personasError)
      return NextResponse.json({ error: 'Error interno' }, { status: 500 })
    }

    if (!personas || personas.length === 0) {
      return NextResponse.json([])
    }

    // Fetch all active pastoral grants (not revoked)
    const personaIds = personas.map((p: UsuarioRow) => p.id)
    const { data: grants, error: grantsError } = await supabase
      .from('platform_capability_grants')
      .select('persona_id, capability_key, granted_at, revoked_at')
      .in('persona_id', personaIds)
      .like('capability_key', 'pastoral.%')

    if (grantsError) {
      console.error('[pastoral/admin/usuarios GET] grants error:', grantsError)
      return NextResponse.json({ error: 'Error interno' }, { status: 500 })
    }

    // Build response: map grants to personas
    const grantsByPersona = new Map<string, CapabilityEntry[]>()
    for (const grant of grants ?? []) {
      const entry: CapabilityEntry = {
        capability_key: grant.capability_key,
        granted_at: grant.granted_at,
        revoked_at: grant.revoked_at,
      }
      const existing = grantsByPersona.get(grant.persona_id) ?? []
      existing.push(entry)
      grantsByPersona.set(grant.persona_id, existing)
    }

    const response: UsuarioResponse[] = personas.map((p: UsuarioRow) => ({
      id: p.id,
      email: p.email,
      nombre: p.nombre,
      apellido: p.apellido,
      auth_id: p.auth_id,
      capabilities: grantsByPersona.get(p.id) ?? [],
    }))

    return NextResponse.json(response)
  } catch (error) {
    console.error('[pastoral/admin/usuarios GET] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
