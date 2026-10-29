'use client'

/**
 * "+N más" / "Ver menos" under a person's servicios (a 44px button). Mi
 * equipo's person list uses it (components/dream-team/mi-equipo/lista-personas.tsx);
 * Servidores itself moved to `ListaResponsiva` (lista-servidores.tsx) with
 * design system v2. It moves with Mi equipo when that screen migrates.
 */
import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

const ANILLO =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-background'

export function BotonVerMas({
  ocultos,
  expandido,
  onCambio,
}: {
  readonly ocultos: number
  readonly expandido: boolean
  readonly onCambio: (expandido: boolean) => void
}): ReactElement {
  return (
    <button
      type="button"
      aria-expanded={expandido}
      onClick={() => onCambio(!expandido)}
      className={cn(
        'min-h-[44px] rounded-xl px-2 text-sm font-medium text-brand-text transition-colors hover:bg-accent',
        ANILLO,
      )}
    >
      {expandido ? 'Ver menos' : `+${ocultos} más`}
    </button>
  )
}
