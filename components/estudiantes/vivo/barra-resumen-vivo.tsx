'use client'

/**
 * Estudiantes › En vivo — the side bar of the meeting (artboards 04 / 05 of
 * design/estudiantes-dps, B23 and B27), the planned `BarraContexto` composed
 * here:
 *
 * - `MetricasVivo` (gap EA3): Presentes, Visitantes, Grupos sin marcar and
 *   Ausentes as rows with their hint in the 260px bar, 2 × 2 cards on a
 *   phone. Each toggles its filter (`aria-pressed`, brand tint when on);
 *   «Grupos sin marcar» is the only filter of unmarked groups (S6).
 * - `AreasVivo` (gap EA4): one card per sub-área (presentes of inscritos,
 *   the presentes / ausentes / sin marcar bar and the flags "1 grupo sin
 *   marcar", "3 visitantes"); a tap enters the área (`?area`), as today.
 */
import type { ReactElement } from 'react'

import { BadgeSistema } from '@/components/ui/sistema-diseno'
import { FONDO_TONO } from '@/components/ui/punto-estado'
import type { AreaVivo, MetricaVista, MetricaVivo } from '@/lib/platform/estudiantes/vivo-vista'
import { cn } from '@/lib/utils'

const palabra = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios)

export function MetricasVivo({ metricas, onAlternar }: { readonly metricas: readonly MetricaVista[]; readonly onAlternar: (id: MetricaVivo) => void }): ReactElement {
  return (
    <div role="group" aria-label="Resumen de la reunión" className="grid grid-cols-2 gap-2.5 md:flex md:flex-col md:gap-0.5">
      {metricas.map((m) => (
        <button
          key={m.id}
          type="button"
          aria-pressed={m.activa}
          onClick={() => onAlternar(m.id)}
          className={cn(
            'focus-ring grid min-h-16 min-w-0 touch-manipulation grid-cols-[minmax(0,1fr)_auto] content-start items-center gap-x-2 rounded-2xl border px-3 py-2.5 text-left transition-colors',
            'md:min-h-10 md:content-center md:rounded-md md:px-2 md:py-1.5',
            m.activa ? 'border-brand/40 bg-brand-tint' : 'border-border bg-card md:border-transparent md:bg-transparent md:hover:bg-accent',
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-muted-foreground md:text-foreground">
            <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', FONDO_TONO[m.tono])} />
            <span className="truncate">{m.etiqueta}</span>
          </span>
          <span className="col-span-2 row-start-2 font-mono text-xl font-semibold tabular-nums text-foreground md:col-span-1 md:col-start-2 md:row-start-1 md:text-sm">
            {m.valor}
            {m.total !== undefined && <span className="text-xs font-normal text-muted-foreground">/{m.total}</span>}
          </span>
          <span className="col-span-2 hidden text-xs text-muted-foreground md:block">{m.pista}</span>
        </button>
      ))}
    </div>
  )
}

export function AreasVivo({ areas, onElegir }: { readonly areas: readonly AreaVivo[]; readonly onElegir: (id: string) => void }): ReactElement {
  return (
    <div className="grid grid-cols-2 gap-2 min-[1100px]:grid-cols-1">
      {areas.map((a) => {
        const ancho = (n: number): string => `${a.inscritos > 0 ? (n / a.inscritos) * 100 : 0}%`
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onElegir(a.id)}
            className="focus-ring block w-full rounded-md border border-border bg-card p-2 text-left transition-colors hover:bg-accent"
          >
            <span className="flex justify-between gap-2 text-[13px] font-semibold text-foreground">
              <span className="truncate">{a.label}</span>
              <span className="font-mono tabular-nums">{a.presentes}</span>
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              presentes de <span className="font-mono tabular-nums">{a.inscritos}</span> inscritos · <span className="font-mono tabular-nums">{a.grupos}</span>{' '}
              {palabra(a.grupos, 'grupo', 'grupos')}
            </span>
            <span aria-hidden="true" className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted">
              <span className={FONDO_TONO.success} style={{ width: ancho(a.presentes) }} />
              <span className={FONDO_TONO.danger} style={{ width: ancho(a.ausentes) }} />
              <span className={FONDO_TONO.warning} style={{ width: ancho(a.sinMarcar) }} />
            </span>
            <span className="sr-only">{`, ${a.presentes} presentes, ${a.ausentes} ausentes, ${a.sinMarcar} sin marcar`}</span>
            {(a.gruposSinMarcar > 0 || a.visitantes > 0) && (
              <span className="mt-2 flex flex-wrap gap-1">
                {a.gruposSinMarcar > 0 && (
                  <BadgeSistema variante="warning" tamaño="sm">
                    {`${a.gruposSinMarcar} ${palabra(a.gruposSinMarcar, 'grupo sin marcar', 'grupos sin marcar')}`}
                  </BadgeSistema>
                )}
                {a.visitantes > 0 && (
                  <BadgeSistema variante="info" tamaño="sm">
                    {`${a.visitantes} ${palabra(a.visitantes, 'visitante', 'visitantes')}`}
                  </BadgeSistema>
                )}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
