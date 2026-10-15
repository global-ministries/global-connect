import SeasonForm from "@/components/forms/SeasonForm"

import { PaginaSistema, TarjetaSistema } from "@/components/ui/sistema-diseno"

export default function CreateSeasonPage() {
  return (
    <PaginaSistema
      titulo="Crear Temporada"
      descripcion="Ingresa los datos para crear una nueva temporada"
      regreso={{ href: '/grupos-vida/temporadas', texto: 'Volver a Temporadas' }}
      ancho="form"
    >
      <TarjetaSistema>
        <SeasonForm />
      </TarjetaSistema>
    </PaginaSistema>
  )
}
