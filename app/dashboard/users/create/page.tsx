import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import UserCreateForm from "@/components/forms/UserCreateForm";
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ContenedorDashboard, TituloSistema, BotonSistema } from '@/components/ui/sistema-diseno'

export default function CreateUserPage() {
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
