import { Users, UsersRound, Activity, UserCheck } from "lucide-react"
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import {
  ContenedorDashboard,
  TarjetaSistema,
  TituloSistema,
  TextoSistema,
  BadgeSistema
} from '@/components/ui/sistema-diseno'

export default function PaginaTablero() {
  const metricas = [
    {
      titulo: "Total Miembros",
      valor: "2,847",
      crecimiento: "+12.5%",
      esPositivo: true,
      icono: Users,
    },
    {
      titulo: "Grupos Activos", 
      valor: "24",
      crecimiento: "+8.3%",
      esPositivo: true,
      icono: UsersRound,
    },
    {
      titulo: "Asistencia Global",
      valor: "89.2%", 
      crecimiento: "-2.1%",
      esPositivo: false,
      icono: Activity,
    },
    {
      titulo: "Líderes Activos",
      valor: "156",
      crecimiento: "+15.7%", 
      esPositivo: true,
      icono: UserCheck,
    },
  ]

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo="Dashboard"
        descripcion="Aquí tienes un resumen de tu comunidad"
      >
        {/* Cuadrícula de Métricas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {metricas.map((metrica, indice) => {
            const Icono = metrica.icono
            return (
              <TarjetaSistema key={indice} className="p-6 hover:shadow-lg transition-all duration-200">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center">
                    <Icono className="w-6 h-6 text-white" />
                  </div>
                  <BadgeSistema variante={metrica.esPositivo ? "success" : "error"} tamaño="sm">
                    {metrica.crecimiento}
                  </BadgeSistema>
                </div>
                <div>
                  <TituloSistema nivel={3} className="mb-1">{metrica.valor}</TituloSistema>
                  <TextoSistema variante="sutil" tamaño="sm">{metrica.titulo}</TextoSistema>
                </div>
              </TarjetaSistema>
            )
          })}
        </div>
      </ContenedorDashboard>
    </DashboardLayout>
  )
}