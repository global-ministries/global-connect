'use client'

/**
 * DPS › Plan · Orden — the context sidebar (`aside.ps` of
 * prototipos/planificacion-dps/02-plan-domingo-orden.html; planned
 * `BarraContexto` of docs/design-system/components.md#planning-style-components,
 * local here until it moves to components/ui). From md, 240px `bg-card
 * border-r` that scrolls on its own: «Horarios» (horarios-plan.tsx) and
 * «Equipos» with «N convocados · N falta» per team, each one opening the
 * Equipos tab. On a phone it stacks above the order as plain sections. The
 * artboard's «Notas» are not built yet (no notes in the database).
 */
import { useId, type ReactElement } from 'react'

import { CLASE_TITULO_SECCION } from '@/components/grupos-vida/planner/estilo-planner'
import type { PasoCronograma } from '@/lib/platform/dps/orden'
import { contarEquipoPlan, lineaEquipo, type EquiposPlan } from '@/lib/platform/dps/plan'
import { cn } from '@/lib/utils'

import { HorariosPlan } from './horarios-plan'

export interface OrdenBarraProps {
  readonly horarios: readonly string[]
  readonly llegada: string
  readonly cronograma: readonly PasoCronograma[]
  readonly editable: boolean
  readonly equipos: EquiposPlan | null
  readonly onGuardarHorarios: (horarios: readonly string[], llegada: string) => void
  readonly onVerEquipos: () => void
  readonly className?: string
}

export function OrdenBarra({ horarios, llegada, cronograma, editable, equipos, onGuardarHorarios, onVerEquipos, className }: OrdenBarraProps): ReactElement {
  const id = useId()
  return (
    <aside
      aria-label="Detalles del plan"
      className={cn('border-border md:w-60 md:shrink-0 md:overflow-y-auto md:border-r md:bg-card [&>section+section]:border-t [&>section+section]:border-border', className)}
    >
      <HorariosPlan horarios={horarios} llegada={llegada} cronograma={cronograma} editable={editable} onGuardar={onGuardarHorarios} />
      {equipos && equipos.equipos.length > 0 && (
        <section aria-labelledby={`${id}-eq`} className="hidden px-3 pt-2.5 pb-3 md:block">
          <h2 id={`${id}-eq`} className={cn(CLASE_TITULO_SECCION, 'flex min-h-[26px] items-center px-1')}>
            Equipos
          </h2>
          <ul>
            {equipos.equipos.map((e) => {
              const cuenta = contarEquipoPlan(e)
              return (
                <li key={e.equipoId}>
                  <button
                    type="button"
                    onClick={onVerEquipos}
                    className="focus-ring block w-full rounded-md py-[5px] pr-1 pl-2 text-left transition-colors hover:bg-accent"
                  >
                    <span className="block break-words text-[13px] font-semibold">{e.equipo}</span>
                    <small className="text-xs text-muted-foreground">
                      {cuenta.falta > 0 ? (
                        <>
                          {lineaEquipo(cuenta).split(' · ')[0]} ·{' '}
                          <span className="font-semibold text-danger-text">{lineaEquipo(cuenta).split(' · ')[1]}</span>
                        </>
                      ) : (
                        lineaEquipo(cuenta)
                      )}
                    </small>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </aside>
  )
}
