'use client'

import { AlertTriangle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
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
      <Badge variant="secondary" className="whitespace-normal">
        {resultado.tipo === 'elegido' ? 'Salón asignado' : 'Salón sugerido'}: {resultado.salon.nombre}
      </Badge>
    )
  }

  const id = 'asignar-salon'
  return (
    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <p className="flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        Sin salón sugerido: asígnalo manualmente
      </p>
      <label htmlFor={id} className="sr-only">
        Asignar salón
      </label>
      <select
        id={id}
        aria-label="Asignar salón"
        className="h-11 w-full rounded-md border bg-background px-3 text-sm text-foreground"
        defaultValue=""
        disabled={deshabilitado}
        onChange={(e) => e.target.value && onElegir(e.target.value)}
      >
        <option value="">Elige un salón…</option>
        {salones
          .filter((s) => s.activo)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
      </select>
    </div>
  )
}
