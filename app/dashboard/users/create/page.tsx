import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import UserCreateForm from "@/components/forms/UserCreateForm";
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ContenedorDashboard, TituloSistema, BotonSistema } from '@/components/ui/sistema-diseno'

export default async function CreateUserPage() {
  // Verificar permisos antes de mostrar el formulario
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/')
  }
  const { data: permitido } = await supabase.rpc('puede_crear_usuario' as any, {
    p_auth_id: user.id,
  })
  if (!permitido) {
    redirect('/dashboard/users')
  }

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo=""
        descripcion=""
        accionPrincipal={null}
      >
        <div className="space-y-6">
          {/* Header minimalista con botón de regreso */}
          <div className="flex items-center gap-4">
            <Link href="/dashboard/users">
              <BotonSistema
                variante="ghost"
                tamaño="sm"
                className="p-2"
              >
                <ArrowLeft className="w-5 h-5" />
              </BotonSistema>
            </Link>
            <TituloSistema nivel={2}>Agregar Miembro</TituloSistema>
          </div>

          {/* Formulario de creación */}
          <UserCreateForm />
        </div>
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
