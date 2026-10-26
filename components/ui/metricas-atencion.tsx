'use client'

/**
 * MetricasAtencion — the attention metrics that ARE the filter (docs/
 * design-system/components.md, "Attention metrics"; prototype `.metric`).
 * Every card is a real `<button aria-pressed>`: status dot, label, the value
 * in mono, a proportion bar (valor / total) and a hint. Pressing one toggles
 * its filter through `onAlternar`; the parent owns the state.
 *
 * 4 columns from `lg`, 2×2 below. Below `md` (phone) the cards are compact
 * and drop the bar and the hint (docs/design-system/mobile.md, "Metrics").
 * The pressed card uses the single brand tint (decision 6, 2026-10-26),
 * outlined by the brand border from md and, on phone where cards have no
 * border, by a 1.5px inset ring (prototype `.metric[aria-pressed]`).
 */
import type { ReactElement } from 'react'

import { FONDO_TONO, PuntoEstado, type TonoEstado } from '@/components/ui/punto-estado'
import { cn } from '@/lib/utils'

export interface MetricaAtencion {
  readonly id: string
  readonly etiqueta: string
  readonly valor: number
  /** Denominator of the proportion bar; without it there is no bar. */
  readonly total?: number
  /** One short line under the bar, e.g. "75% del equipo". */
  readonly pista?: string
  readonly tono: TonoEstado
  readonly activa: boolean
}

export interface MetricasAtencionProps {
  readonly metricas: readonly MetricaAtencion[]
  readonly onAlternar: (id: string) => void
  /** Accessible name of the group, e.g. "Necesitan atención". */
  readonly etiqueta: string
  readonly className?: string
}

/** valor / total as a 0–100 percentage; total 0 reads as empty. */
function porcentaje(valor: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((valor / total) * 100)))
}

export function MetricasAtencion({ metricas, onAlternar, etiqueta, className }: MetricasAtencionProps): ReactElement {
  return (
    <div role="group" aria-label={etiqueta} className={cn('grid grid-cols-2 gap-2.5 md:gap-3 lg:grid-cols-4', className)}>
      {metricas.map((metrica) => (
        <button
          key={metrica.id}
          type="button"
          aria-pressed={metrica.activa}
          onClick={() => onAlternar(metrica.id)}
          className={cn(
            'focus-ring grid min-w-0 gap-1.5 rounded-2xl border p-3 text-left transition-colors md:gap-2.5 md:p-4',
            metrica.activa
              ? 'border-transparent bg-brand-tint max-md:ring-[1.5px] max-md:ring-inset max-md:ring-brand md:border-brand'
              : 'border-transparent bg-card hover:bg-accent md:border-border',
          )}
        >
          <PuntoEstado tono={metrica.tono} etiqueta={metrica.etiqueta} className="min-w-0 truncate" />
          <span className="font-mono text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground tabular-nums md:text-3xl">
            {metrica.valor}
          </span>
          {metrica.total !== undefined && (
            <span data-barra="" aria-hidden="true" className="hidden h-1 overflow-hidden rounded-full bg-muted md:block">
              <span
                data-relleno=""
                className={cn('block h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out-quint)]', FONDO_TONO[metrica.tono])}
                style={{ width: `${porcentaje(metrica.valor, metrica.total)}%` }}
              />
            </span>
          )}
          {metrica.pista && (
            <span data-pista="" className="hidden truncate text-xs text-muted-foreground md:block">
              {metrica.pista}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
