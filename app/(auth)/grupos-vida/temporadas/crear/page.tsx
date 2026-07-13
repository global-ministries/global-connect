import { Calendar } from "lucide-react"
import Link from "next/link"
import SeasonForm from "@/components/forms/SeasonForm"

import { ContenedorDashboard, TarjetaSistema, BotonSistema } from "@/components/ui/sistema-diseno"

export default function CreateSeasonPage() {
  return (
<ContenedorDashboard
        titulo="Crear Temporada"
        descripcion="Ingresa los datos para crear una nueva temporada"
        botonRegreso={{ href: '/grupos-vida/temporadas', texto: 'Volver a Temporadas' }}
      >
        <TarjetaSistema>
          <SeasonForm />
        </TarjetaSistema>
      </ContenedorDashboard>
)
}
