'use client'

/**
 * Mi equipo — the per-person "⋯" actions menu (a 44px button).
 *
 * Only what the API supports today: "Cambiar etapa", which opens the shared
 * stage dialog (`<AvanceEtapaControl>` in controlled mode, PATCH
 * /api/dream-team/servicios/[id]). There is no API to change a servicio's rol
 * or to remove someone from a team, so those actions are deliberately absent.
 *
 * Renders nothing when there is nothing to do: a Grupos de Vida leader (its
 * lifecycle is managed in Grupos de Vida) or an estado with no valid
 * transition (retirado).
 */
import { useState, type ReactElement } from 'react'
import { ArrowRightLeft, MoreHorizontal } from 'lucide-react'

import { AvanceEtapaControl } from '@/components/dream-team/avance-etapa-control'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { PersonaVista } from '@/lib/platform/dream-team/mi-equipo-vista'
import { TRANSICIONES_VALIDAS } from '@/lib/platform/dream-team/state-machine'

export interface MenuPersonaProps {
  readonly persona: PersonaVista
  readonly onActualizado: () => void
}

export function tieneAccionesDisponibles(persona: PersonaVista): boolean {
  return (
    persona.editable &&
    persona.servicioId !== undefined &&
    persona.version !== undefined &&
    (TRANSICIONES_VALIDAS[persona.estado]?.size ?? 0) > 0
  )
}

export function MenuPersona({ persona, onActualizado }: MenuPersonaProps): ReactElement | null {
  const [etapaAbierta, setEtapaAbierta] = useState(false)
  if (!tieneAccionesDisponibles(persona) || persona.servicioId === undefined || persona.version === undefined) return null

  return (
    <>
      {/* modal={false}: the stage dialog opens from an item, and a modal menu would fight it for focus and pointer events. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Acciones para ${persona.nombre}`}
            className="col-start-3 row-span-2 row-start-1 flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] md:col-start-auto md:row-span-1 md:row-start-auto"
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem className="min-h-11 px-3 text-sm" onSelect={() => setEtapaAbierta(true)}>
            <ArrowRightLeft aria-hidden="true" />
            Cambiar etapa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AvanceEtapaControl
        servicioId={persona.servicioId}
        estadoActual={persona.estado}
        version={persona.version}
        puedeEditar
        abierto={etapaAbierta}
        onAbiertoChange={setEtapaAbierta}
        ocultarBoton
        onSuccess={onActualizado}
      />
    </>
  )
}
