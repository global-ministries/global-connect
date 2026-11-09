/**
 * Estudiantes — the phone side of the scope (artboards 12, 14 and 16 of
 * design/estudiantes-dps; mobile.md): what the «barra de alcance» holds on a
 * desktop moves into the page.
 * - `MetricasCompactas`: the attention toggles in one row of 64px cards
 *   (2 × 2 with four), label and number, `aria-pressed` (B6 on phones).
 * - `SeccionMovil`: a bleed list section with a sticky `bg-muted` header
 *   under the top bar ("Grupos de Chicas · 3 · 39 integrantes").
 * Server-safe.
 */
import type { ReactElement, ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface MetricaCompacta {
  readonly id: string
  readonly etiqueta: string
  readonly valor: number
  readonly aviso?: boolean
  readonly activa: boolean
}

export function MetricasCompactas({ etiqueta, metricas, onAlternar }: { readonly etiqueta: string; readonly metricas: readonly MetricaCompacta[]; readonly onAlternar: (id: string) => void }): ReactElement {
  return (
    <div role="group" aria-label={etiqueta} className={cn('grid gap-2', metricas.length === 4 ? 'grid-cols-2' : 'grid-cols-3')}>
      {metricas.map((m) => (
        <button
          key={m.id}
          type="button"
          aria-pressed={m.activa}
          onClick={() => onAlternar(m.id)}
          className={cn(
            'focus-ring flex min-h-16 min-w-0 flex-col items-start gap-0.5 rounded-2xl bg-card px-3 py-2.5 text-left transition-colors active:bg-accent',
            m.activa && 'ring-[1.5px] ring-brand ring-inset',
          )}
        >
          <b className="max-w-full truncate text-xs font-semibold text-muted-foreground">{m.etiqueta}</b>
          <span className={cn('font-mono text-[22px] font-semibold tabular-nums', m.aviso && m.valor > 0 ? 'text-warning-text' : 'text-foreground')}>{m.valor}</span>
        </button>
      ))}
    </div>
  )
}

export function SeccionMovil({ id, titulo, detalle, children }: { readonly id: string; readonly titulo: string; readonly detalle?: ReactNode; readonly children: ReactNode }): ReactElement {
  return (
    <section aria-labelledby={id} className="-mx-4 sm:-mx-6">
      <div className="sticky top-[calc(max(env(safe-area-inset-top),12px)_+_3.25rem)] z-[2] flex min-h-9 items-center gap-2 border-b border-border bg-muted px-4 sm:px-6">
        <h2 id={id} className="min-w-0 truncate text-[13px] font-semibold text-foreground">
          {titulo}
        </h2>
        {detalle && <small className="shrink-0 text-xs text-muted-foreground">{detalle}</small>}
      </div>
      <div className="px-4 pt-2 sm:px-6">{children}</div>
    </section>
  )
}
