/**
 * W17 — DT-004 — Server component for usuarios admin page.
 *
 * Fetches usuarios with pastoral capabilities and renders the client component.
 * Auth: requires pastoral.admin.manage.
 */
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requirePastoralSession, hasPastoralAdminManageCapability } from '@/lib/platform/pastoral/route-access'
import { isPastoralEnabled } from '@/lib/platform/pastoral/flags'
import UsuariosClient from './UsuariosClient'

export const dynamic = 'force-dynamic'

type UsuarioRow = {
  id: string
  email: string | null
  nombre: string
  apellido: string
  auth_id: string | null
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
  email: string | null
  nombre: string
  apellido: string
  auth_id: string | null
  capabilities: CapabilityEntry[]
}

export default async function PastorUsuariosPage() {
  if (!isPastoralEnabled()) redirect('/')
  const session = await requirePastoralSession()
  if (!session || !hasPastoralAdminManageCapability(session)) redirect('/')

  const supabase = await createSupabaseServerClient()

  // Fetch all usuarios
  const { data: usuarios, error: usuariosError } = await supabase
    .from('usuarios')
    .select('id, email, nombre, apellido, auth_id')
    .order('apellido', { ascending: true })

  if (usuariosError || !usuarios) {
    return <UsuariosClient usuarios={[]} error="Error al cargar usuarios" />
  }

  if (usuarios.length === 0) {
    return <UsuariosClient usuarios={[]} error={null} />
  }

  // Fetch all pastoral grants
  const personaIds = usuarios.map((p: UsuarioRow) => p.id)
  const { data: grants } = await supabase
    .from('dream_team_capability_grants')
    .select('persona_id, capability_key, granted_at, revoked_at')
    .in('persona_id', personaIds)
    .like('capability_key', 'pastoral.%')

  // Build response
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

  const usuariosResponse: UsuarioResponse[] = usuarios.map((p: UsuarioRow) => ({
    id: p.id,
    email: p.email,
    nombre: p.nombre,
    apellido: p.apellido,
    auth_id: p.auth_id,
    capabilities: grantsByPersona.get(p.id) ?? [],
  }))

  return <UsuariosClient usuarios={usuariosResponse} error={null} />
}
