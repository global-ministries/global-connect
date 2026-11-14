/**
 * The small tag of a notice's text (R4b of odd/tasks/talleres-rediseno.md;
 * design/talleres-avisos 01–04 `.tag`): «Personalizado» (brand), «Texto
 * predeterminado» and the other neutral states. Text, never color alone.
 */
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function EtiquetaTexto({ tono = 'neutro', children, className }: { tono?: 'marca' | 'neutro'; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] shrink-0 items-center gap-1 rounded-md border px-1.5 text-xs font-semibold whitespace-nowrap',
        tono === 'marca' ? 'border-brand/40 bg-brand-tint text-brand-text' : 'border-border bg-muted text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  )
}
