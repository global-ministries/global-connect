/**
 * W17 — DT-007 — Server component for grants admin page.
 *
 * Fetches usuario data with capabilities and renders GrantsManager.
 * Auth: requires pastoral.admin.manage.
 */
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requirePastoralSession, hasPastoralAdminManageCapability } from '@/lib/platform/pastoral/route-access'
import { isPastoralEnabled } from '@/lib/platform/pastoral/flags'
import { GrantsManager } from '@/components/pastoral/GrantsManager'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'

export const dynamic = 'force-dynamic'

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

interface PageProps {
  params: Promise<{ usuario_id: string }>
}

export default async function PastorGrantsPage({ params }: PageProps) {
  if (!isPastoralEnabled()) redirect('/')
  const session = await requirePastoralSession()
  if (!session || !hasPastoralAdminManageCapability(session)) redirect('/')

  const { usuario_id } = await params
  if (!usuario_id) redirect('/pastor/usuarios')

  const supabase = await createSupabaseServerClient()

  // Fetch usuario
  const { data: usuario, error: usuarioError } = await supabase
    .from('usuarios')
    .select('id, email, nombre, apellido')
    .eq('id', usuario_id)
    .single()

  if (usuarioError || !usuario) {
    redirect('/pastor/usuarios')
  }

  // Fetch grants for this usuario
  const { data: grants } = await supabase
    .from('dream_team_capability_grants')
    .select('persona_id, capability_key, granted_at, revoked_at')
    .eq('persona_id', usuario_id)
    .like('capability_key', 'pastoral.%')

  const capabilities: CapabilityEntry[] = (grants ?? []).map((g: GrantRow) => ({
    capability_key: g.capability_key,
    granted_at: g.granted_at,
    revoked_at: g.revoked_at,
  }))

  const usuarioNombre = `${usuario.nombre} ${usuario.apellido}`

  return (
    <ContenedorDashboard
      titulo="Gestionar Capabilities"
      descripcion={`Capabilities para ${usuarioNombre}`}
      botonRegreso={{ href: '/pastor/usuarios', texto: 'Volver a usuarios' }}
    >
      <GrantsManager
        usuarioId={usuario_id}
        usuarioNombre={usuarioNombre}
        capabilitiesIniciales={capabilities}
      />
    </ContenedorDashboard>
  )
}
