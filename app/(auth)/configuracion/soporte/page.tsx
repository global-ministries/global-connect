import { grantSupportCapability, revokeSupportCapability } from '@/lib/actions/support-capabilities.actions'
import { SUPPORT_CAPABILITIES, SUPPORT_CAPABILITY_LABELS } from '@/lib/support/capabilities'
import { getUserWithRoles } from '@/lib/getUserWithRoles'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { BotonSistema, ContenedorDashboard, InputSistema, SelectSistema, TarjetaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { redirect } from 'next/navigation'

const SUPPORT_CONFIGURATION_ROLES = ['admin', 'pastor', 'director-general']

const CAPABILITY_OPTIONS = SUPPORT_CAPABILITIES.map((capability) => ({
  valor: capability,
  etiqueta: SUPPORT_CAPABILITY_LABELS[capability],
}))

export default async function SupportCapabilitiesPage() {
  const supabase = await createSupabaseServerClient()
  const userData = await getUserWithRoles(supabase)

  if (!userData?.user) redirect('/login')

  const hasHigherRole = userData.roles.some((role: string) => SUPPORT_CONFIGURATION_ROLES.includes(role))
  const hasSupportManage = await hasSupportManageCapability(supabase, userData.user.id)
  if (!hasHigherRole || !hasSupportManage) {
    return (
      <DashboardLayout>
        <ContenedorDashboard titulo="Configuracion de soporte" botonRegreso={{ href: '/dashboard', texto: 'Dashboard' }}>
          <TarjetaSistema className="space-y-3">
            <TituloSistema nivel={2}>Acceso requerido</TituloSistema>
            <TextoSistema variante="sutil">Esta configuracion requiere un rol de administracion alto y la capacidad support.manage. Si necesitas administrar soporte, solicita acceso a un administrador autorizado.</TextoSistema>
          </TarjetaSistema>
        </ContenedorDashboard>
      </DashboardLayout>
    )
  }

  async function grantAction(formData: FormData) {
    'use server'
    await grantSupportCapability(String(formData.get('usuarioId') ?? ''), String(formData.get('capability') ?? ''))
  }

  async function revokeAction(formData: FormData) {
    'use server'
    await revokeSupportCapability(String(formData.get('usuarioId') ?? ''), String(formData.get('capability') ?? ''))
  }

  return (
    <DashboardLayout>
      <ContenedorDashboard titulo="Configuracion de soporte" descripcion="Administra capacidades de soporte con cambios auditados y limitados al conjunto permitido.">
        <TarjetaSistema className="space-y-4">
          <TituloSistema nivel={2}>Capacidades permitidas</TituloSistema>
          <TextoSistema variante="sutil">Solo se pueden administrar support.view, support.reply y support.manage para usuarios staff o admin.</TextoSistema>
          <div className="grid gap-4 md:grid-cols-2">
            <form action={grantAction} className="space-y-3">
              <InputSistema label="Usuario destino" name="usuarioId" required placeholder="UUID del usuario" />
              <SelectSistema label="Capacidad" name="capability" opciones={CAPABILITY_OPTIONS} defaultValue="support.view" />
              <BotonSistema type="submit">Otorgar capacidad</BotonSistema>
            </form>
            <form action={revokeAction} className="space-y-3">
              <InputSistema label="Usuario destino" name="usuarioId" required placeholder="UUID del usuario" />
              <SelectSistema label="Capacidad" name="capability" opciones={CAPABILITY_OPTIONS} defaultValue="support.view" />
              <BotonSistema type="submit" variante="outline">Revocar capacidad</BotonSistema>
            </form>
          </div>
        </TarjetaSistema>
      </ContenedorDashboard>
    </DashboardLayout>
  )
}

async function hasSupportManageCapability(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, authId: string) {
  const { data: usuario } = await supabase.from('usuarios').select('id').eq('auth_id', authId).maybeSingle()
  if (!usuario?.id) return false

  const { data, error } = await supabase
    .from('support_user_capabilities')
    .select('capability')
    .eq('usuario_id', usuario.id)
    .eq('capability', 'support.manage')
    .is('revoked_at', null)
    .maybeSingle()

  return !error && Boolean(data)
}
