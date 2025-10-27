"use client"

import { TarjetaSistema, TituloSistema, TextoSistema } from '@/components/ui/sistema-diseno'

interface PropsDashboardLider {
  data: any
}

export default function DashboardLider({ data }: PropsDashboardLider) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      <div className="md:col-span-2 xl:col-span-4">
        <TarjetaSistema className="p-6">
          <TituloSistema nivel={3}>¡ACCIÓN REQUERIDA!</TituloSistema>
          <TextoSistema className="mt-2">
            Si no has registrado la asistencia de la semana actual, hazlo ahora para mantener tus registros al día.
          </TextoSistema>
        </TarjetaSistema>
      </div>

      <TarjetaSistema className="p-6">
        <TituloSistema nivel={3}>Asistencia de la Última Reunión</TituloSistema>
        <TextoSistema variante="sutil" className="mt-2">Porcentaje de asistencia de tu última reunión.</TextoSistema>
      </TarjetaSistema>

      <TarjetaSistema className="p-6">
        <TituloSistema nivel={3}>Total de Miembros</TituloSistema>
        <TextoSistema variante="sutil" className="mt-2">Cantidad total de miembros en tu grupo.</TextoSistema>
      </TarjetaSistema>

      <TarjetaSistema className="p-6 md:col-span-2">
        <TituloSistema nivel={3}>Próximos Cumpleaños</TituloSistema>
        <TextoSistema variante="sutil" className="mt-2">Miembros de tu grupo con cumpleaños próximos.</TextoSistema>
      </TarjetaSistema>

      <TarjetaSistema className="p-6 md:col-span-2">
        <TituloSistema nivel={3}>Historial Reciente de Asistencia</TituloSistema>
        <TextoSistema variante="sutil" className="mt-2">Últimos ausentes para seguimiento.</TextoSistema>
      </TarjetaSistema>
    </div>
  )
}
