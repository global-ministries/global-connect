'use client'

/**
 * Niños › Check-in — body of the "Cambiar salón" panel (prototype 01/05
 * `tpl-salon`): every salón with who it is for and its occupancy; the
 * suggested one is marked. A full salón can still be chosen (warns, never
 * blocks). One tap picks it and closes the panel; a salón other than the
 * suggestion is remembered on the ficha for next Sunday (as before).
 */
import type { ReactElement } from 'react'

import { edadCorta, estadoCupo, rangoSalon, type OcupacionSalon } from '@/lib/platform/ninos/checkin-vista'
import type { HijoEncontrado, SalonFila } from '@/lib/platform/ninos/familias-vista'
import { cn } from '@/lib/utils'

import { EtiquetaLleno } from './partes'

export interface SelectorSalonProps {
  readonly hijo: HijoEncontrado
  readonly fecha: string
  readonly salones: readonly SalonFila[]
  readonly ocupacion: ReadonlyMap<string, OcupacionSalon>
  /** The salón the child goes to now (null: none yet). */
  readonly actualId: string | null
  /** The salón suggested by age or remembered on the ficha. */
  readonly sugeridoId: string | null
  readonly onElegir: (salonId: string) => void
}

export function SelectorSalon({ hijo, fecha, salones, ocupacion, actualId, sugeridoId, onElegir }: SelectorSalonProps): ReactElement {
  const edad = edadCorta(hijo.fecha_nacimiento, fecha)
  const sugerido = salones.find((s) => s.id === sugeridoId)
  return (
    <div className="grid min-w-0 gap-3.5">
      <p className="text-[13px] text-muted-foreground">
        {hijo.nombre} {hijo.apellido}
        {edad && ` · ${edad}`}.{' '}
        {sugerido ? (
          <>
            Sugerido: <b className="font-semibold text-foreground">{sugerido.nombre}</b>.
          </>
        ) : (
          'Sin salón sugerido: elige uno.'
        )}
      </p>
      <ul aria-label={`Salones para ${hijo.nombre}`} className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
        {salones.map((s) => {
          const cupo = ocupacion.get(s.id)
          const lleno = cupo !== undefined && estadoCupo(cupo.presentes, cupo.capacidad) === 'lleno'
          const detalle = [rangoSalon(s), s.id === sugeridoId ? 'sugerido' : null].filter(Boolean).join(' · ')
          return (
            <li key={s.id} className="[&+li]:border-t [&+li]:border-border/60">
              <button
                type="button"
                aria-pressed={s.id === actualId}
                onClick={() => onElegir(s.id)}
                className={cn(
                  'focus-ring flex min-h-14 w-full min-w-0 items-center gap-3 px-3.5 py-2 text-left text-base text-foreground touch-manipulation transition-colors active:bg-accent md:hover:bg-accent/50',
                  s.id === actualId && 'bg-brand-tint',
                )}
              >
                <span className="min-w-0 flex-1">
                  <b className="block truncate font-semibold">{s.nombre}</b>
                  {detalle && <small className="block text-[13px] text-muted-foreground">{detalle}</small>}
                </span>
                {lleno && cupo ? (
                  <EtiquetaLleno ocupacion={cupo} />
                ) : cupo ? (
                  <span className="shrink-0 font-mono text-[15px] tabular-nums text-muted-foreground">
                    {cupo.presentes}/{cupo.capacidad}
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="text-[13px] text-muted-foreground">Si eliges otro, queda como su salón para el próximo domingo.</p>
    </div>
  )
}
