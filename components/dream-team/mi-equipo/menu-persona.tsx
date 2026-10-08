'use client'

/**
 * Mi equipo — the per-person "⋯" actions menu (a 44px button).
 *
 * Only what the API supports today: "Cambiar etapa", which opens the shared
 * stage dialog (`<AvanceEtapaControl>` in controlled mode, PATCH
 * /api/dream-team/servicios/[id]), and "Turnos", the campus service shifts of
 * the servicio (PUT /api/dream-team/servicios/[id]/turnos). There is no API to change a servicio's rol
 * or to remove someone from a team, so those actions are deliberately absent.
 *
 * "Editar ficha" (T11) fixes the person's personal data in a side panel; it is
 * offered to the volunteer coordinator of the area, org.manage, admin or pastor
 * (`persona.fichaEditable`), who may hold no write capability at all — then it
 * is the only action (`puedeEditarServicio` false).
 *
 * Renders nothing when there is nothing to do: a Grupos de Vida leader (its
 * lifecycle is managed in Grupos de Vida) or an estado with no valid
 * transition (retirado), unless the ficha is editable.
 */
import { useState, type ReactElement } from 'react'
import { ArrowRightLeft, Clock, MoreHorizontal, UserPen } from 'lucide-react'

import { AvanceEtapaControl } from '@/components/dream-team/avance-etapa-control'
import { TurnosServicioDialog } from '@/components/dream-team/turnos/turnos-servicio-dialog'
import { EditarFichaPanel } from '@/components/dream-team/servidores/editar-ficha-panel'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { PersonaVista } from '@/lib/platform/dream-team/mi-equipo-vista'
import { TRANSICIONES_VALIDAS } from '@/lib/platform/dream-team/state-machine'

export interface MenuPersonaProps {
  readonly persona: PersonaVista
  readonly onActualizado: () => void
  /** Whether the viewer may change the stage and shifts (the write capability). Defaults to true. */
  readonly puedeEditarServicio?: boolean
}

function accionesDeServicio(persona: PersonaVista): boolean {
  return (
    persona.editable &&
    persona.servicioId !== undefined &&
    persona.version !== undefined &&
    (TRANSICIONES_VALIDAS[persona.estado]?.size ?? 0) > 0
  )
}

export function tieneAccionesDisponibles(persona: PersonaVista, puedeEditarServicio = true): boolean {
  return (puedeEditarServicio && accionesDeServicio(persona)) || persona.fichaEditable === true
}

export function MenuPersona({ persona, onActualizado, puedeEditarServicio = true }: MenuPersonaProps): ReactElement | null {
  const [etapaAbierta, setEtapaAbierta] = useState(false)
  const [turnosAbierto, setTurnosAbierto] = useState(false)
  const [fichaAbierta, setFichaAbierta] = useState(false)
  const toast = useNotificaciones()
  if (!tieneAccionesDisponibles(persona, puedeEditarServicio)) return null

  const servicio =
    puedeEditarServicio && accionesDeServicio(persona)
      ? { id: persona.servicioId as string, version: persona.version as number }
      : null
  const puedeEditarFicha = persona.fichaEditable === true

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
          {servicio !== null && (
            <>
              <DropdownMenuItem className="min-h-11 px-3 text-sm" onSelect={() => setEtapaAbierta(true)}>
                <ArrowRightLeft aria-hidden="true" />
                Cambiar etapa
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11 px-3 text-sm" onSelect={() => setTurnosAbierto(true)}>
                <Clock aria-hidden="true" />
                Turnos
              </DropdownMenuItem>
            </>
          )}
          {puedeEditarFicha && (
            <DropdownMenuItem className="min-h-11 px-3 text-sm" onSelect={() => setFichaAbierta(true)}>
              <UserPen aria-hidden="true" />
              Editar ficha
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {servicio !== null && (
        <>
        <AvanceEtapaControl
          servicioId={servicio.id}
          estadoActual={persona.estado}
          version={servicio.version}
          puedeEditar
          abierto={etapaAbierta}
          onAbiertoChange={setEtapaAbierta}
          ocultarBoton
          onSuccess={onActualizado}
        />

        <TurnosServicioDialog
          servicioId={servicio.id}
          nombre={persona.nombre}
          abierto={turnosAbierto}
          onAbiertoChange={setTurnosAbierto}
          onGuardado={onActualizado}
        />
        </>
      )}

      {puedeEditarFicha && (
        <EditarFichaPanel
          personaId={persona.personaId}
          nombre={persona.nombre}
          abierto={fichaAbierta}
          onAbiertoChange={setFichaAbierta}
          onGuardado={onActualizado}
          toast={toast}
        />
      )}
    </>
  )
}
