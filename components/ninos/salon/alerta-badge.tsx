import { AlertTriangle } from 'lucide-react'

import { BadgeSistema } from '@/components/ui/sistema-diseno'
import type { AlertaLista } from '@/lib/platform/ninos/salon'
import { cn } from '@/lib/utils'

/** One alert as an app badge: serious ones (allergies, special needs) in the error color, the rest as warnings. */
export function AlertaBadge({ alerta }: { alerta: AlertaLista }) {
  return (
    <BadgeSistema
      variante={alerta.grave ? 'error' : 'warning'}
      tamaño="sm"
      className={cn('gap-1.5 whitespace-normal', alerta.grave && 'font-semibold text-destructive')}
    >
      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
      {alerta.texto}
    </BadgeSistema>
  )
}
