'use client'

import { AlertTriangle } from 'lucide-react'

import { BadgeSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import type { SalonFila, SalonParaHijo } from '@/lib/platform/ninos/familias-vista'

type Props = {
  resultado: SalonParaHijo
  salones: readonly SalonFila[]
  onElegir: (salonId: string) => void
  deshabilitado?: boolean
}

/**
 * The room shown for a child (D4): the suggestion when the rule finds one, an
 * explicit warning plus a manual picker when it does not. Never guesses.
 */
export function SalonSugerido({ resultado, salones, onElegir, deshabilitado }: Props) {
  if (resultado.tipo !== 'ninguno') {
    return (
      <BadgeSistema variante={resultado.tipo === 'elegido' ? 'success' : 'info'} tamaño="sm" className="whitespace-normal">
        {resultado.tipo === 'elegido' ? 'Salón asignado' : 'Salón sugerido'}: {resultado.salon.nombre}
      </BadgeSistema>
    )
  }

  return (
    <div className="space-y-2 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3">
      <p className="flex items-center gap-2 text-sm font-medium text-yellow-700 dark:text-yellow-400">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        Sin salón sugerido: asígnalo manualmente
      </p>
      <SelectSistema
        aria-label="Asignar salón"
        opciones={[
          { valor: '', etiqueta: 'Elige un salón…' },
          ...salones.filter((s) => s.activo).map((s) => ({ valor: s.id, etiqueta: s.nombre })),
        ]}
        defaultValue=""
        disabled={deshabilitado}
        onChange={(e) => e.target.value && onElegir(e.target.value)}
      />
    </div>
  )
}
