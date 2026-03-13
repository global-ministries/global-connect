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
    <TarjetaSistema className="p-3 md:p-4 lg:p-6 h-full bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/30">
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="p-2.5 sm:p-3 bg-orange-500 rounded-xl flex-shrink-0">
          <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <TituloSistema nivel={3} className="text-orange-900 dark:text-orange-200 text-sm sm:text-base">¡Acción requerida!</TituloSistema>
          <TextoSistema className="mt-1 sm:mt-2 text-orange-800 dark:text-orange-300 text-xs sm:text-sm">{accion.mensaje}</TextoSistema>
        </div>
      </div>
      <div className="mt-3">
        <Link href={`/grupos-vida/${accion.grupo_id}/asistencia`}>
          <BotonSistema tamaño="lg" variante="primario" className="w-full sm:w-auto">Registrar Asistencia</BotonSistema>
        </Link>
      </div>
    </TarjetaSistema>
  )
}
