"use client"

import { TarjetaSistema, TituloSistema, TextoSistema } from '@/components/ui/sistema-diseno'

interface PropsDashboardDirector {
  data: any
}

export default function DashboardDirector({ data }: PropsDashboardDirector) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      <div className="md:col-span-2 xl:col-span-3">
        <TarjetaSistema className="p-6">
          <TituloSistema nivel={3}>KPIs de mi Alcance</TituloSistema>
          <TextoSistema variante="sutil" className="mt-2">
            Próximamente: Total Miembros, Asistencia Semanal (%), Total de Grupos, Grupos sin Reporte.
          </TextoSistema>
        </TarjetaSistema>
      </div>

      <TarjetaSistema className="p-6">
        <TituloSistema nivel={3}>Recordatorios de Asistencia</TituloSistema>
        <TextoSistema variante="sutil" className="mt-2">
          Lista de líderes que no han registrado la asistencia esta semana.
        </TextoSistema>
      </TarjetaSistema>

      <div className="md:col-span-2">
        <TarjetaSistema className="p-6">
          <TituloSistema nivel={3}>Tendencia de Asistencia (8 semanas)</TituloSistema>
          <TextoSistema variante="sutil" className="mt-2">Gráfico filtrado a mis grupos.</TextoSistema>
        </TarjetaSistema>
      </div>

      <TarjetaSistema className="p-6">
        <TituloSistema nivel={3}>Próximos Cumpleaños</TituloSistema>
        <TextoSistema variante="sutil" className="mt-2">Miembros de mis grupos.</TextoSistema>
      </TarjetaSistema>

      <TarjetaSistema className="p-6">
        <TituloSistema nivel={3}>Top Asistencia</TituloSistema>
        <TextoSistema variante="sutil" className="mt-2">Mejor y peor asistencia de la última semana.</TextoSistema>
      </TarjetaSistema>
    </div>
  )
}
