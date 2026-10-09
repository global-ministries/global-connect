/**
 * Niños — empty-state card, the same pattern as Dream Team's
 * components/dream-team/estado-vacio.tsx (each module keeps its own copy so
 * modules do not import each other): a muted lucide icon, a title and an
 * optional subtitle inside a `TarjetaSistema`. Not a client component: no
 * hooks, no handlers.
 */
import type { LucideIcon } from 'lucide-react'
import type { ReactElement } from 'react'

import { TarjetaSistema } from '@/components/ui/sistema-diseno'

type Props = {
  icono: LucideIcon
  titulo: string
  subtitulo?: string
  /** Smaller padding for empty states inside a side column. */
  compacto?: boolean
}

export function EstadoVacio({ icono: Icono, titulo, subtitulo, compacto }: Props): ReactElement {
  return (
    <TarjetaSistema className={compacto ? 'p-5' : 'p-8'}>
      <div className="flex flex-col items-center gap-3 text-center">
        <Icono className={compacto ? 'h-8 w-8 text-muted-foreground/40' : 'h-12 w-12 text-muted-foreground/40'} aria-hidden />
        <div>
          <p className="font-medium text-muted-foreground">{titulo}</p>
          {subtitulo && <p className="mt-1 text-sm text-muted-foreground/70">{subtitulo}</p>}
        </div>
      </div>
    </TarjetaSistema>
  )
}
