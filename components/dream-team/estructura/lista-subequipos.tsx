'use client'

/**
 * Estructura — the teams inside the selected one: one card, one button row
 * per team (responsable and people), tapping a row selects that team.
 */
import type { ReactElement } from 'react'
import { ChevronRight } from 'lucide-react'

import { TarjetaSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'
import type { HijoDetalle } from '@/lib/platform/dream-team/estructura-vista'

import { ANILLO_FOCO, personasTexto } from './mensajes'

export interface ListaSubequiposProps {
  readonly hijos: readonly HijoDetalle[]
  /** Whether "Agregar sub-equipo" exists for this viewer, to point at it when the list is empty. */
  readonly puedeAgregar: boolean
  readonly onSeleccionar: (equipoId: string) => void
}

export function ListaSubequipos({ hijos, puedeAgregar, onSeleccionar }: ListaSubequiposProps): ReactElement {
  const resumen =
    hijos.length === 0
      ? 'Este equipo no tiene equipos dentro'
      : hijos.length === 1
        ? '1 equipo dentro'
        : `${hijos.length} equipos dentro`

  return (
    <TarjetaSistema role="region" aria-label="Sub-equipos" className="flex flex-col overflow-hidden p-0">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <TituloSistema nivel={3}>Sub-equipos</TituloSistema>
        <p className="text-sm text-muted-foreground">{resumen}</p>
      </div>

      {hijos.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-sm font-semibold text-foreground">Sin sub-equipos</p>
          {puedeAgregar && (
            <p className="mt-1.5 text-sm text-muted-foreground">Usa «Agregar sub-equipo» para crear uno dentro de este.</p>
          )}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {hijos.map((hijo) => (
            <button
              key={hijo.id}
              type="button"
              onClick={() => onSeleccionar(hijo.id)}
              className={cn(
                'flex min-h-[64px] w-full items-center justify-between gap-3 px-5 py-2 text-left transition-colors hover:bg-accent sm:px-6',
                ANILLO_FOCO,
              )}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-foreground sm:text-base">{hijo.label}</span>
                <span className="truncate text-sm text-muted-foreground">
                  {hijo.responsable ? `${hijo.responsable.nombre} — ${hijo.responsable.rol}` : 'Sin responsable asignado'}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                <span>{personasTexto(hijo.personasRama)}</span>
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </span>
            </button>
          ))}
        </div>
      )}
    </TarjetaSistema>
  )
}
