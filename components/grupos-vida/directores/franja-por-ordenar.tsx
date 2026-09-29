'use client'

/**
 * Directores — the "Por ordenar" strip: what still has no director or no
 * segment. Each block's action is a link to where it gets fixed. On desktop it
 * is one column per item; on phones one collapsible row that counts the pending items.
 * The page does not render it when there is nothing to sort out.
 */
import { useState, type ReactElement } from 'react'
import Link from 'next/link'
import { ChevronDown, TriangleAlert } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { ItemPorOrdenar } from '@/lib/platform/grupos-vida/directores-vista'

export const ANILLO =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-background'

// One column per item, so a single block does not sit alone in a third of the row.
const COLUMNAS: Readonly<Record<number, string>> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
}

export interface FranjaPorOrdenarProps {
  readonly items: readonly ItemPorOrdenar[]
}

export function FranjaPorOrdenar({ items }: FranjaPorOrdenarProps): ReactElement | null {
  const [abierta, setAbierta] = useState(false)
  if (items.length === 0) return null

  const resumen = `${items.length} ${items.length === 1 ? 'pendiente' : 'pendientes'} por ordenar`

  return (
    <section aria-label="Por ordenar" className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        aria-expanded={abierta}
        onClick={() => setAbierta((actual) => !actual)}
        className={cn('flex min-h-[52px] w-full items-center gap-2.5 rounded-2xl px-4 text-left text-sm font-semibold text-foreground md:hidden', ANILLO)}
      >
        <TriangleAlert className="h-[18px] w-[18px] shrink-0 text-yellow-600 dark:text-yellow-400" aria-hidden="true" />
        <span className="flex-1">{resumen}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', abierta && 'rotate-180')} aria-hidden="true" />
      </button>

      <div className="hidden items-center gap-2 px-5 pt-4 text-[13px] font-bold uppercase tracking-wider text-muted-foreground md:flex">
        <TriangleAlert className="h-4 w-4 text-yellow-600 dark:text-yellow-400" aria-hidden="true" />
        <h2>Por ordenar</h2>
      </div>

      <ul className={cn('gap-3 p-3 md:grid md:p-5', COLUMNAS[Math.min(items.length, 3)], abierta ? 'grid' : 'hidden')}>
        {items.map((item) => (
          <li key={item.tipo} className="flex flex-col justify-between gap-1.5 rounded-xl border border-border bg-background p-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{item.titulo}</p>
              <p className="text-[13px] text-muted-foreground">{item.detalle}</p>
            </div>
            <Link
              href={item.href}
              className={cn(
                '-ml-3 inline-flex min-h-[44px] items-center self-start rounded-[10px] px-3 text-sm font-semibold text-[var(--brand-primary)] transition-colors hover:bg-accent',
                ANILLO,
              )}
            >
              {item.accion}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
