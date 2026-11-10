/**
 * The metric cards of the home's cargo blocks and «Visión general»
 * (design/home-por-rol `.mets`): the look of MetricasAtencion — status dot
 * and label, the value in mono, a proportion bar and a hint — without the
 * filter, since on the home they only report. 2×2 compact on phone (no bar,
 * no hint); 4 or 5 columns from lg.
 *
 * Server-safe: no hooks, no handlers.
 */
import type { ReactElement } from 'react'

import { FONDO_TONO, PuntoEstado, type TonoEstado } from '@/components/ui/punto-estado'
import { cn } from '@/lib/utils'

export type MetricaInicio = {
  readonly id: string
  readonly etiqueta: string
  /** null when it could not be read: shows «—». */
  readonly valor: number | null
  readonly sufijo?: '%'
  /** Denominator of the bar; without it there is no bar. */
  readonly total?: number
  readonly pista?: string
  readonly tono: TonoEstado
}

const formato = new Intl.NumberFormat('es-VE')

/** valor / total as a 0–100 width; total 0 reads as empty. */
function ancho(valor: number, total: number): number {
  return total <= 0 ? 0 : Math.min(100, Math.max(0, Math.round((valor / total) * 100)))
}

export function MetricasInicio({ metricas, etiqueta, className }: { readonly metricas: readonly MetricaInicio[]; readonly etiqueta: string; readonly className?: string }): ReactElement {
  return (
    <div role="group" aria-label={etiqueta} className={cn('grid grid-cols-2 gap-2.5 md:gap-3', metricas.length >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4', className)}>
      {metricas.map((m) => (
        <div key={m.id} data-metrica="" className="grid min-w-0 content-start gap-1.5 rounded-2xl border border-transparent bg-card p-3 md:gap-2.5 md:border-border md:p-4">
          <PuntoEstado tono={m.tono} etiqueta={m.etiqueta} className="min-w-0" />
          <span className="font-mono text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground tabular-nums md:text-3xl">
            {m.valor === null ? (
              <>
                <span aria-hidden="true">—</span>
                <span className="sr-only">sin dato</span>
              </>
            ) : (
              <>
                {formato.format(m.valor)}
                {m.sufijo && <small className="text-[15px] font-medium text-muted-foreground">{m.sufijo}</small>}
              </>
            )}
          </span>
          {m.total !== undefined && m.valor !== null && (
            <span aria-hidden="true" className="hidden h-1 overflow-hidden rounded-full bg-muted md:block">
              <span className={cn('block h-full rounded-full', FONDO_TONO[m.tono])} style={{ width: `${ancho(m.valor, m.total)}%` }} />
            </span>
          )}
          {m.pista && <span className="hidden truncate text-xs text-muted-foreground md:block">{m.pista}</span>}
        </div>
      ))}
    </div>
  )
}
