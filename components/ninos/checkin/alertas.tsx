/** Niños › Check-in — the health alerts of a child as badges ("Alergias: maní", "Sin fotos"). */
import type { ReactElement } from 'react'

import { BadgeSistema } from '@/components/ui/sistema-diseno'

export function Alertas({ alertas }: { readonly alertas: readonly string[] }): ReactElement | null {
  if (alertas.length === 0) return null
  return (
    <span className="flex min-w-0 flex-wrap gap-1.5">
      {alertas.map((a) => (
        <BadgeSistema key={a} variante="error" tamaño="sm" className="max-w-full truncate">
          {a}
        </BadgeSistema>
      ))}
    </span>
  )
}
