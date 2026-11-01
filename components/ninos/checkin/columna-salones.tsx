/**
 * Niños › Check-in — the salones column of the desktop desk (≥ lg,
 * prototype 05 `.col-salones`): the total inside the service, each salón
 * with its occupancy, a "Casi lleno" / "Lleno" tag and a bar, and the note
 * that a full salón warns but does not block. Below lg the chip row
 * (SalonesOcupacion) takes its place.
 */
import type { ReactElement } from 'react'

import { FONDO_TONO, PuntoEstado } from '@/components/ui/punto-estado'
import { estadoCupo, porcentajeCupo, type OcupacionSalon } from '@/lib/platform/ninos/checkin-vista'
import { cn } from '@/lib/utils'

import { TONO_CUPO, TituloSeccion } from './partes'

const ETIQUETA: Record<'casi' | 'lleno', { texto: string; clase: string }> = {
  casi: { texto: 'Casi lleno', clase: 'border-warning/40 bg-warning/10 text-warning-text' },
  lleno: { texto: 'Lleno', clase: 'border-danger/40 bg-danger/10 text-danger-text' },
}

export function ColumnaSalones({ ocupacion, adentro }: { readonly ocupacion: readonly OcupacionSalon[] | null; readonly adentro: number }): ReactElement {
  return (
    <aside aria-labelledby="checkin-columna-salones" className="grid min-w-0 content-start gap-3 lg:sticky lg:top-24">
      <TituloSeccion id="checkin-columna-salones" texto="Salones" pista="Adentro / capacidad" />
      <div className="flex items-baseline justify-between gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-[13px] text-muted-foreground">
        <span>Adentro en este servicio</span>
        <b className="font-mono text-[26px] font-semibold tabular-nums text-foreground">{adentro}</b>
      </div>
      {ocupacion === null ? (
        <p className="px-1 text-sm text-muted-foreground">Cargando…</p>
      ) : ocupacion.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">Sin salones para este servicio.</p>
      ) : (
        <ul aria-label="Ocupación por salón" className="min-w-0 rounded-2xl border border-border bg-card px-4 py-1">
          {ocupacion.map((o) => {
            const estado = estadoCupo(o.presentes, o.capacidad)
            const etiqueta = estado === 'libre' ? null : ETIQUETA[estado]
            return (
              <li key={o.salon_id} className="grid min-w-0 gap-1.5 py-2.5 [&+li]:border-t [&+li]:border-border/60">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <PuntoEstado tono={TONO_CUPO[estado]} />
                  <span className="min-w-0 flex-1 truncate text-foreground">{o.nombre}</span>
                  {etiqueta && (
                    <span className={cn('shrink-0 rounded-full border px-2 text-xs font-medium leading-[22px]', etiqueta.clase)}>{etiqueta.texto}</span>
                  )}
                  <span className={cn('shrink-0 font-mono text-[13px] tabular-nums', estado === 'lleno' ? 'font-semibold text-danger-text' : 'text-muted-foreground')}>
                    {o.presentes}/{o.capacidad}
                  </span>
                </span>
                <span aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-muted">
                  <i className={cn('block h-full rounded-full', FONDO_TONO[TONO_CUPO[estado]])} style={{ width: `${porcentajeCupo(o.presentes, o.capacidad)}%` }} />
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <p className="px-1 text-[13px] text-muted-foreground">Lleno avisa, no bloquea: el ingreso se registra y se avisa a la coordinación.</p>
    </aside>
  )
}
