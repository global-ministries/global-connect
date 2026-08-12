/**
 * PR21 — Admin page: /admin/talleres/nuevo (RSC + wizard client).
 *
 * 3-step wizard:
 *   1. Datos básicos del taller (nombre, edicion, tipo, link_type,
 *      sesiones, duracion, fecha_inicio_periodo, fecha_fin_periodo)
 *   2. Cohorte (equipo existente o crear nuevo)
 *
 * Note: firmantes del certificado se gestionan en otra PR (PR22+) — el
 * snapshot de firmantes en esta fila queda en [] por ahora.
 *
 * RSC fetches the available dream_team_equipos list (with
 * experiencia='talleres_crecimiento', activo=true). The wizard UI
 * manages the form state and invokes the server action on submit.
 */

import { redirect } from 'next/navigation'

import { ContenedorDashboard, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'

import { CrearTallerWizard } from './wizard-client'

export const metadata = {
  title: 'Crear Taller',
}

interface EquipoRow {
  id: string
  label: string
}

export default async function CrearTallerPage() {
  if (!isTalleresEnabled()) {
    redirect('/dashboard')
  }

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const session = await resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) =>
      findPlatformSessionPersonaByAuthId(supabase, authId),
    capabilitySupabase: supabase,
  })
  if (!session) {
    redirect('/login')
  }

  const caps = session.capabilities.map((c) => c.key)
  const hasCap =
    caps.includes('talleres_crecimiento.director.write') ||
    caps.includes('talleres_crecimiento.admin.manage')
  if (!hasCap) {
    return (
      <ContenedorDashboard titulo="Crear Taller" botonRegreso={{ href: '/dashboard', texto: 'Inicio' }}>
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">
            No tenés permiso para crear talleres. Necesitás la capability
            <code className="mx-1">talleres_crecimiento.director.write</code>
            o
            <code className="mx-1">talleres_crecimiento.admin.manage</code>.
          </TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  // Fetch available dream_team_equipos (talleres_crecimiento) for the
  // wizard's "select existing" step.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase
  const { data: equiposData } = await client
    .from('dream_team_equipos')
    .select('id, label')
    .eq('experiencia', 'talleres_crecimiento')
    .eq('activo', true)
    .order('label', { ascending: true })
    .limit(200)

  const equipos: EquipoRow[] = (equiposData ?? []) as EquipoRow[]

  return (
    <ContenedorDashboard titulo="Crear Taller" botonRegreso={{ href: '/dashboard', texto: 'Inicio' }}>
      <TarjetaSistema variante="outlined" className="mb-4 p-4">
        <TextoSistema variante="sutil">
          Wizard de 2 pasos: <strong>1. Datos del taller</strong> →{' '}
          <strong>2. Cohorte inicial</strong>. Al confirmar, se crea
          atómicamente el taller + el evento + el periodo + la cohorte
          (y opcionalmente un equipo nuevo). Los firmantes del certificado
          se gestionan al crear el certificado (PR22+).
        </TextoSistema>
      </TarjetaSistema>
      <CrearTallerWizard
        equiposDisponibles={equipos}
      />
    </ContenedorDashboard>
  )
}
