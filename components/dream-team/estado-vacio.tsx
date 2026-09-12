'use client'

/**
 * Dream Team — own empty-state card. Dream Team must not import from
 * `components/talleres/` (see dashboard-page.tsx's `EmptyState`) — this is
 * its replacement, following the Grupos de Vida empty-state pattern (see
 * components/grupos/GruposList.client.tsx:468-479): a lucide icon at
 * `w-12 h-12 text-muted-foreground/40`, a title, and an optional subtitle,
 * inside a `TarjetaSistema`.
 */
import type { LucideIcon } from 'lucide-react'
import type { ReactElement } from 'react'

import { TarjetaSistema } from '@/components/ui/sistema-diseno'

export interface EstadoVacioProps {
  readonly icono: LucideIcon
  readonly titulo: string
  readonly subtitulo?: string
}

export function EstadoVacio({ icono: Icono, titulo, subtitulo }: EstadoVacioProps): ReactElement {
  return (
    <TarjetaSistema className="p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <Icono className="h-12 w-12 text-muted-foreground/40" />
        <div>
          <p className="font-medium text-muted-foreground">{titulo}</p>
          {subtitulo && <p className="mt-1 text-sm text-muted-foreground/70">{subtitulo}</p>}
        </div>
      </div>
    </TarjetaSistema>
  )
}
