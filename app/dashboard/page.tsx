import { Users, UsersRound, Activity, UserCheck } from "lucide-react"

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
    <div className="space-y-6">
      {/* Encabezado de Bienvenida */}
      <div className="mb-6 lg:mb-8">
        <div className="backdrop-blur-2xl bg-white/30 border border-white/50 rounded-3xl p-4 lg:p-6 shadow-2xl">
          <h2 className="text-2xl lg:text-3xl font-bold text-gray-800 mb-2">¡Hola, Pastor Juan Pablo!</h2>
          <p className="text-gray-600 text-sm lg:text-base">Aquí tienes un resumen de tu comunidad</p>
        </div>
      </div>

      {/* Cuadrícula de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {metricas.map((metrica, indice) => {
          const Icono = metrica.icono
          return (
            <div key={indice} className="backdrop-blur-2xl bg-white/30 border border-white/50 rounded-3xl p-4 lg:p-6 shadow-2xl hover:shadow-3xl transition-all duration-200">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center">
                  <Icono className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
                </div>
                <div className={`flex items-center gap-1 text-xs lg:text-sm font-medium ${metrica.esPositivo ? "text-green-600" : "text-red-500"}`}>
                  <span>{metrica.crecimiento}</span>
                </div>
              </div>
              <div>
                <h3 className="text-xl lg:text-2xl font-bold text-gray-800 mb-1">{metrica.valor}</h3>
                <p className="text-gray-600 text-xs lg:text-sm">{metrica.titulo}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}