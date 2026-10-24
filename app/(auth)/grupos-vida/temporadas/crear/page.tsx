import SeasonForm from "@/components/forms/SeasonForm"

import { PaginaSistema } from "@/components/ui/sistema-diseno"

export default function CreateSeasonPage() {
  return (
    <PaginaSistema
      titulo="Crear Temporada"
      descripcion="Ingresa los datos para crear una nueva temporada"
      regreso={{ href: '/grupos-vida/temporadas', texto: 'Volver a Temporadas' }}
    >
      {/* The form renders its own section cards: no wrapper card around it. */}
      <SeasonForm />
    </PaginaSistema>
  )
}
