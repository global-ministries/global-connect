"use client"

import Link from 'next/link'
import { TarjetaSistema, TituloSistema, TextoSistema, BotonSistema } from '@/components/ui/sistema-diseno'
import { AlertTriangle } from 'lucide-react'

interface AccionRequerida {
  tipo: 'REGISTRAR_ASISTENCIA'
  mensaje: string
  grupo_id: string
  grupo_nombre: string
}

interface ActionRequiredWidgetProps {
  accion: AccionRequerida | null
}

export function ActionRequiredWidget({ accion }: ActionRequiredWidgetProps) {
  if (!accion) return null
  return (
    <TarjetaSistema className="p-6 bg-orange-50 border border-orange-200">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-orange-500 rounded-xl flex-shrink-0">
          <AlertTriangle className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <TituloSistema nivel={3} className="text-orange-900">¡Acción requerida!</TituloSistema>
          <TextoSistema className="mt-2 text-orange-800">{accion.mensaje}</TextoSistema>
        </div>
        <div className="flex-shrink-0">
          <Link href={`/dashboard/grupos/${accion.grupo_id}/asistencia`}>
            <BotonSistema tamaño="lg" variante="primario">Registrar Asistencia</BotonSistema>
          </Link>
        </div>
      </div>
    </TarjetaSistema>
  )
}
