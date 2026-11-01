/**
 * Niños › Check-in — the salones of the service as chips with their
 * occupancy ("Caminantes 12/12"). Full in the danger tint, almost full with a
 * warning dot; the state is also in words. Phone: one chip row that scrolls
 * sideways (the only horizontal scroller allowed); md and up: it wraps. On
 * the desktop desk (`columna`) the salones column replaces it from lg.
 */
import type { ReactElement } from 'react'

import { PuntoEstado } from '@/components/ui/punto-estado'
import { estadoCupo, type OcupacionSalon } from '@/lib/platform/ninos/checkin-vista'
import { cn } from '@/lib/utils'

import { TEXTO_CUPO, TONO_CUPO, TituloSeccion } from './partes'

export function SalonesOcupacion({ ocupacion, columna = false }: { readonly ocupacion: readonly OcupacionSalon[] | null; readonly columna?: boolean }): ReactElement {
  return (
    <section aria-labelledby="checkin-salones" className={cn('grid min-w-0 gap-2', columna && 'lg:hidden')}>
      <TituloSeccion id="checkin-salones" texto="Salones" pista="Adentro / capacidad" />
      {ocupacion === null ? (
        <p className="px-1 text-sm text-muted-foreground">Cargando…</p>
      ) : ocupacion.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">Sin salones para este servicio.</p>
      ) : (
        <ul
          aria-label="Ocupación de salones"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
        >
          {ocupacion.map((o) => {
            const estado = estadoCupo(o.presentes, o.capacidad)
            const lleno = estado === 'lleno'
            return (
              <li
                key={o.salon_id}
                className={cn(
                  'inline-flex min-h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-[13px]',
                  lleno ? 'border-danger/40 bg-danger/10 text-danger-text' : 'border-border bg-card text-muted-foreground',
                )}
              >
                <PuntoEstado tono={TONO_CUPO[estado]} />
                {o.nombre}
                <b className={cn('font-mono font-semibold tabular-nums', lleno ? 'text-danger-text' : 'text-foreground')}>
                  {o.presentes}/{o.capacidad}
                </b>
                {TEXTO_CUPO[estado] && <span className="sr-only">, {TEXTO_CUPO[estado]}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
