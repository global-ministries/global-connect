'use client'

/**
 * Mi equipo — the team picker: "Toda la dirección" plus one selectable card per
 * team. Every card is a real `<button aria-pressed>`.
 *
 * ONE set of buttons serves every width: a horizontally scrollable row of
 * pills on phones, a responsive grid of cards from `md` up (2 → 3 → 5
 * columns as the screen grows). With more than `MAX_EQUIPOS_EN_TARJETAS` teams (Grupos de Vida)
 * the cards give way to a compact scrollable list with its own filter.
 */
import { useState, type ReactElement } from 'react'
import { Search } from 'lucide-react'

import { BadgeSistema, InputSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'
import { normalizarTexto, type ResponsableVista, type TarjetaEquipo } from '@/lib/platform/dream-team/mi-equipo-vista'

export interface TarjetasEquiposProps {
  readonly todaLaDireccion: TarjetaEquipo
  readonly equipos: readonly TarjetaEquipo[]
  readonly modoCompacto: boolean
  readonly seleccionadoId: string
  readonly onSeleccionar: (equipoId: string) => void
}

function lineaResponsable(responsable: ResponsableVista | null): string | null {
  if (!responsable) return null
  return `${responsable.rol === 'coordinador' ? 'Coordina' : 'Dirige'} ${responsable.nombre}`
}

const ANILLO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-background'

function claseSeleccion(activo: boolean): string {
  return activo
    ? 'border-[var(--brand-primary)] bg-[var(--brand-accent)]'
    : 'border-border bg-card hover:bg-accent'
}

function TarjetaBoton({
  tarjeta,
  activo,
  onSeleccionar,
}: {
  readonly tarjeta: TarjetaEquipo
  readonly activo: boolean
  readonly onSeleccionar: (equipoId: string) => void
}): ReactElement {
  const responsable = lineaResponsable(tarjeta.responsable)
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={() => onSeleccionar(tarjeta.id)}
      className={cn(
        'flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border-[1.5px] px-4 text-left transition-colors',
        'md:min-h-[148px] md:shrink md:flex-col md:items-stretch md:justify-between md:gap-3 md:rounded-2xl md:p-4',
        claseSeleccion(activo),
        ANILLO,
      )}
    >
      <span className="flex min-w-0 flex-col md:gap-1.5">
        <span className="whitespace-nowrap text-sm font-semibold text-foreground md:whitespace-normal md:text-base">
          {tarjeta.label}
        </span>
        {responsable && <span className="hidden text-sm text-muted-foreground md:block">{responsable}</span>}
      </span>
      <span className="flex items-baseline gap-1.5 md:items-end md:justify-between">
        <span className="flex items-baseline gap-1.5">
          <span className="text-sm font-bold tabular-nums text-foreground md:text-3xl">
            <span aria-hidden="true" className="md:hidden">
              ·{' '}
            </span>
            {tarjeta.total}
          </span>
          <span className="hidden text-sm text-muted-foreground md:inline">{tarjeta.total === 1 ? 'persona' : 'personas'}</span>
        </span>
        {tarjeta.porActivar > 0 && (
          <BadgeSistema variante="info" tamaño="sm" className="hidden md:inline-flex">
            {tarjeta.porActivar} por activar
          </BadgeSistema>
        )}
      </span>
    </button>
  )
}

function FilaCompacta({
  tarjeta,
  activo,
  onSeleccionar,
}: {
  readonly tarjeta: TarjetaEquipo
  readonly activo: boolean
  readonly onSeleccionar: (equipoId: string) => void
}): ReactElement {
  const responsable = lineaResponsable(tarjeta.responsable)
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={() => onSeleccionar(tarjeta.id)}
      className={cn(
        'flex min-h-[44px] w-full items-center justify-between gap-3 border-l-2 px-4 py-2 text-left transition-colors',
        activo ? 'border-l-[var(--brand-primary)] bg-[var(--brand-accent)]' : 'border-l-transparent hover:bg-accent',
        ANILLO,
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{tarjeta.label}</span>
        {responsable && <span className="block truncate text-xs text-muted-foreground">{responsable}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {tarjeta.porActivar > 0 && (
          <BadgeSistema variante="info" tamaño="sm">
            {tarjeta.porActivar} por activar
          </BadgeSistema>
        )}
        <span className="text-sm font-semibold tabular-nums text-foreground">{tarjeta.total}</span>
      </span>
    </button>
  )
}

export function TarjetasEquipos({
  todaLaDireccion,
  equipos,
  modoCompacto,
  seleccionadoId,
  onSeleccionar,
}: TarjetasEquiposProps): ReactElement {
  const [filtro, setFiltro] = useState('')

  if (modoCompacto) {
    const consulta = normalizarTexto(filtro)
    // While filtering, only matching teams are listed ("Toda la dirección" included only when not filtering).
    const visibles = equipos.filter((equipo) => consulta === '' || normalizarTexto(equipo.label).includes(consulta))
    return (
      <div className="space-y-3">
        <div className="max-w-sm">
          <InputSistema
            type="search"
            icono={Search}
            aria-label="Buscar equipo"
            placeholder="Buscar equipo"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
        </div>
        <div
          role="group"
          aria-label="Equipos"
          className="max-h-72 divide-y divide-border overflow-y-auto rounded-2xl border border-border bg-card"
        >
          {consulta === '' && (
            <FilaCompacta tarjeta={todaLaDireccion} activo={seleccionadoId === todaLaDireccion.id} onSeleccionar={onSeleccionar} />
          )}
          {visibles.map((equipo) => (
            <FilaCompacta key={equipo.id} tarjeta={equipo} activo={seleccionadoId === equipo.id} onSeleccionar={onSeleccionar} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      role="group"
      aria-label="Equipos"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 md:mx-0 md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:px-0 lg:grid-cols-3 xl:grid-cols-5"
    >
      <TarjetaBoton tarjeta={todaLaDireccion} activo={seleccionadoId === todaLaDireccion.id} onSeleccionar={onSeleccionar} />
      {equipos.map((equipo) => (
        <TarjetaBoton key={equipo.id} tarjeta={equipo} activo={seleccionadoId === equipo.id} onSeleccionar={onSeleccionar} />
      ))}
    </div>
  )
}
