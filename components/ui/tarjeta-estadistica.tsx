import { TarjetaGlassmorphism } from "@/components/ui/tarjeta-glassmorphism"
import { TrendingUp, TrendingDown, LucideIcon } from "lucide-react"

interface TarjetaEstadisticaProps {
  titulo: string
  valor: string
  crecimiento: string
  esPositivo: boolean
  Icono: LucideIcon
  colorGradiente?: string
}

export function TarjetaEstadistica({
  titulo,
  valor,
  crecimiento,
  esPositivo,
  Icono,
  colorGradiente = "from-purple-500 to-pink-500"
}: TarjetaEstadisticaProps) {
  return (
    <TarjetaGlassmorphism claseAdicional="hover:shadow-3xl transition-all duration-200">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-10 h-10 lg:w-12 lg:h-12 bg-gradient-to-br ${colorGradiente} rounded-xl flex items-center justify-center`}>
          <Icono className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
        </div>
        <div
          className={`flex items-center gap-1 text-xs lg:text-sm font-medium ${
            esPositivo ? "text-green-600" : "text-red-500"
          }`}
        >
          {esPositivo ? (
            <TrendingUp className="w-3 h-3 lg:w-4 lg:h-4" />
          ) : (
            <TrendingDown className="w-3 h-3 lg:w-4 lg:h-4" />
          )}
          {crecimiento}
        </div>
      </div>

      <div>
        <h3 className="text-xl lg:text-2xl font-bold text-gray-800 mb-1">{valor}</h3>
        <p className="text-gray-600 text-xs lg:text-sm">{titulo}</p>
      </div>
    </TarjetaGlassmorphism>
  )
}
