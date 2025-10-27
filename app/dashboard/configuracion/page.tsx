import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ContenedorDashboard, TarjetaSistema, TituloSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { Layers, CalendarDays } from 'lucide-react'

export default async function PageConfiguracion() {
  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo="Configuración del Sistema"
        descripcion="Administra los parámetros, catálogos y módulos fundamentales de la aplicación."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link href="/dashboard/segments" className="block">
            <TarjetaSistema className="p-6 hover:shadow-2xl transition-shadow">
              <div className="flex items-start gap-4">
                <Layers size={40} className="text-orange-500" />
                <div className="space-y-1">
                  <TituloSistema nivel={3}>Segmentos</TituloSistema>
                  <TextoSistema>
                    Organiza y administra las categorías principales de tus grupos (ej. Matrimonios, Hombres, Mujeres).
                  </TextoSistema>
                </div>
              </div>
            </TarjetaSistema>
          </Link>

          <Link href="/dashboard/temporadas" className="block">
            <TarjetaSistema className="p-6 hover:shadow-2xl transition-shadow">
              <div className="flex items-start gap-4">
                <CalendarDays size={40} className="text-blue-500" />
                <div className="space-y-1">
                  <TituloSistema nivel={3}>Temporadas</TituloSistema>
                  <TextoSistema>
                    Define los períodos temporales de tu organización para estructurar los ciclos de los grupos.
                  </TextoSistema>
                </div>
              </div>
            </TarjetaSistema>
          </Link>
        </div>
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
