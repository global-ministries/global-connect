/**
 * Planner — the small status tag of cards, people and bank rows ("Sin Líder",
 * "Repite líder", "Activo en 2026-I"). The status tag of foundations.md
 * (tint fill + `-text` token); the words carry the meaning, never the color
 * alone. Server-safe.
 */
import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

export type TonoEtiqueta = 'danger' | 'warning' | 'success' | 'info' | 'neutro'

const TONOS: Readonly<Record<TonoEtiqueta, string>> = {
  danger: 'bg-danger/10 text-danger-text',
  warning: 'bg-warning/10 text-warning-text',
  success: 'bg-success/10 text-success-text',
  info: 'bg-info/10 text-info-text',
  neutro: 'bg-muted text-muted-foreground',
}

export function EtiquetaPlanner({ tono, children }: { readonly tono: TonoEtiqueta; readonly children: string }): ReactElement {
  return (
    <span title={children} className={cn('inline-block max-w-full truncate rounded-full px-2 py-0.5 text-xs font-medium', TONOS[tono])}>
      {children}
    </span>
  )
}
