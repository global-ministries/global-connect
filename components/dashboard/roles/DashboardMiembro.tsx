"use client"

import Link from 'next/link'
import { TarjetaSistema, TituloSistema, TextoSistema, BotonSistema } from '@/components/ui/sistema-diseno'

interface PropsDashboardMiembro {
  data: any
}

export default function DashboardMiembro({ data }: PropsDashboardMiembro) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      <div className="md:col-span-2 xl:col-span-2">
        <TarjetaSistema className="p-6">
          <TituloSistema nivel={3}>Mi Grupo</TituloSistema>
          <TextoSistema variante="sutil" className="mt-2">
            Aquí verás información de tu grupo: nombre, día/hora de reunión y datos de contacto del líder.
          </TextoSistema>
          <div className="mt-4">
            <Link href="/dashboard/perfil">
              <BotonSistema variante="primario" tamaño="sm">Actualizar mi información</BotonSistema>
            </Link>
          </div>
        </TarjetaSistema>
      </div>

      <TarjetaSistema className="p-6">
        <TituloSistema nivel={3}>Próximos Cumpleaños en mi Grupo</TituloSistema>
        <TextoSistema variante="sutil" className="mt-2">Listado de próximos cumpleaños.</TextoSistema>
      </TarjetaSistema>

      <TarjetaSistema className="p-6">
        <TituloSistema nivel={3}>Mi Historial de Asistencia</TituloSistema>
        <TextoSistema variante="sutil" className="mt-2">Resumen de tus últimas asistencias.</TextoSistema>
      </TarjetaSistema>
    </div>
  )
}
