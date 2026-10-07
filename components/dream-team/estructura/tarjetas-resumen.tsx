'use client'

/**
 * Estructura — the three summary cards of a team: who is responsible, how many
 * people, and the linked taller.
 */
import type { ReactElement, ReactNode } from 'react'

import { EnlaceSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import type { DetalleEquipo } from '@/lib/platform/dream-team/estructura-vista'

const ENLACE = 'flex min-h-[44px] items-center text-sm'

function Tarjeta({ titulo, children }: { readonly titulo: string; readonly children: ReactNode }): ReactElement {
  return (
    <TarjetaSistema
      role="region"
      aria-label={titulo}
      className="flex min-h-[108px] flex-col justify-between gap-2 p-4 sm:p-[18px]"
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</span>
      {children}
    </TarjetaSistema>
  )
}

export interface TarjetasResumenProps {
  readonly detalle: DetalleEquipo
  /** Root direccion above the team, for the "Ver en Mi equipo" link. */
  readonly direccionId: string
  /** Whether the viewer can go assign someone in Servidores. */
  readonly puedeAsignar: boolean
}

export function TarjetasResumen({ detalle, direccionId, puedeAsignar }: TarjetasResumenProps): ReactElement {
  const { responsable, taller } = detalle
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Tarjeta titulo="Responsable">
        {responsable ? (
          <div>
            <p className="text-base font-semibold text-foreground">{responsable.nombre}</p>
            <p className="text-sm text-muted-foreground">
              {responsable.heredadoDe ? `${responsable.rol} · heredado de ${responsable.heredadoDe.label}` : responsable.rol}
            </p>
            {responsable.heredadoDe && puedeAsignar && (
              <EnlaceSistema
                variante="marca"
                href={`/admin/dream-team/servidores?equipo=${encodeURIComponent(detalle.id)}`}
                className="flex min-h-[44px] items-center text-xs"
              >
                Asígnalo en Servidores
              </EnlaceSistema>
            )}
          </div>
        ) : (
          <div>
            <p className="text-base font-semibold text-foreground">Sin responsable</p>
            {puedeAsignar && (
              <EnlaceSistema variante="marca" href={`/admin/dream-team/servidores?equipo=${encodeURIComponent(detalle.id)}`} className={ENLACE}>
                Asígnalo en Servidores
              </EnlaceSistema>
            )}
          </div>
        )}
      </Tarjeta>

      <Tarjeta titulo="Personas">
        <div className="flex flex-wrap items-end justify-between gap-x-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold tabular-nums tracking-tight text-foreground">{detalle.personasRama}</span>
            <span className="text-sm text-muted-foreground">{detalle.esRama ? 'en toda la rama' : 'en este equipo'}</span>
          </div>
          <EnlaceSistema variante="marca" href={`/dream-team/mi-equipo?direccion=${encodeURIComponent(direccionId)}`} className={ENLACE}>
            Ver en Mi equipo
          </EnlaceSistema>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Taller vinculado">
        {taller ? (
          <div className="flex flex-wrap items-end justify-between gap-x-3">
            <p className="text-base font-semibold text-foreground">{taller.nombre}</p>
            <EnlaceSistema variante="marca" href={taller.href} className={ENLACE}>
              Abrir taller
            </EnlaceSistema>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Este equipo no tiene un taller.</p>
        )}
      </Tarjeta>
    </div>
  )
}
