'use client'

/**
 * Servidores — the per-row "⋯" menu (a 44px button): "Cambiar etapa" (the
 * shared stage dialog, controlled mode), "Turnos" (the campus service shifts
 * of the servicio; also for whoever may fix the ficha, the volunteer
 * coordinator, who keeps the shifts up to date too), "Editar ficha" (the person's personal data, T11; for the
 * volunteer coordinator, org.manage, admin or pastor, see
 * lib/platform/dream-team/ficha-persona.ts) and "Ver su equipo" (Mi equipo on
 * the person's dirección).
 *
 * Renders nothing for a row without actions: a read-only viewer who may not
 * fix the ficha either, or a Grupos de Vida leader (its lifecycle is managed in
 * Grupos de Vida).
 */
import { useState, type ReactElement } from 'react'
import Link from 'next/link'
import { ArrowRightLeft, Clock, MoreHorizontal, MailPlus, UserPen, Users } from 'lucide-react'

import { AvanceEtapaControl } from '@/components/dream-team/avance-etapa-control'
import { TurnosServicioDialog } from '@/components/dream-team/turnos/turnos-servicio-dialog'
import { InvitarCuentaPanel } from '@/components/cuentas/invitar-cuenta-panel'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { FilaServidor } from '@/lib/platform/dream-team/servidores-vista'
import { TRANSICIONES_VALIDAS } from '@/lib/platform/dream-team/state-machine'
import { EditarFichaPanel } from './editar-ficha-panel'

export interface MenuServidorProps {
  readonly fila: FilaServidor
  readonly onActualizado: () => void
  readonly className?: string
  /** Tells apart the menus of one person's servicios: "Acciones para Ana en Coro". */
  readonly detalle?: string
}

function editaServicio(fila: FilaServidor): boolean {
  return fila.editable && fila.servicioId !== undefined && fila.version !== undefined
}

export function tieneMenu(fila: FilaServidor): boolean {
  return editaServicio(fila) || fila.fichaEditable === true
}

/**
 * What the viewer may do with one servicio. The single rule behind this menu
 * and the Servidores detail drawer; the server checks every action again.
 */
export interface AccionesServicio {
  /** Any action at all; without it there is not even "Ver su equipo". */
  readonly alguna: boolean
  /** The editable servicio, when the viewer may change its stage. */
  readonly servicio: { readonly id: string; readonly version: number } | null
  readonly cambiarEtapa: boolean
  /** The servicio whose shifts the viewer may change; `undefined` when none. */
  readonly turnosDe: string | undefined
  readonly editarFicha: boolean
  readonly invitar: boolean
}

export function accionesDeServicio(fila: FilaServidor): AccionesServicio {
  const servicio = editaServicio(fila) ? { id: fila.servicioId as string, version: fila.version as number } : null
  const editarFicha = fila.fichaEditable === true
  return {
    alguna: tieneMenu(fila),
    servicio,
    cambiarEtapa: servicio !== null && (TRANSICIONES_VALIDAS[fila.estado]?.size ?? 0) > 0,
    // A retired servicio no longer serves, so it has no shifts to change.
    turnosDe: fila.estado === 'retirado' ? undefined : (servicio?.id ?? (editarFicha ? fila.servicioId : undefined)),
    editarFicha,
    // T12: the same people may invite someone without account to sign in.
    invitar: editarFicha && fila.tieneCuenta === false,
  }
}

export function MenuServidor({ fila, onActualizado, className, detalle }: MenuServidorProps): ReactElement | null {
  const [etapaAbierta, setEtapaAbierta] = useState(false)
  const [turnosAbierto, setTurnosAbierto] = useState(false)
  const [fichaAbierta, setFichaAbierta] = useState(false)
  const [invitarAbierto, setInvitarAbierto] = useState(false)
  const toast = useNotificaciones()
  const acciones = accionesDeServicio(fila)
  if (!acciones.alguna) return null

  const { servicio, turnosDe } = acciones
  const puedeCambiarEtapa = acciones.cambiarEtapa && servicio !== null
  const puedeEditarFicha = acciones.editarFicha
  const puedeInvitar = acciones.invitar

  return (
    <>
      {/* modal={false}: the stage dialog opens from an item, and a modal menu would fight it for focus and pointer events. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <BotonSistema
            type="button"
            variante="ghost"
            soloIcono
            icono={MoreHorizontal}
            aria-label={detalle ? `Acciones para ${fila.nombre} en ${detalle}` : `Acciones para ${fila.nombre}`}
            className={className}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          {puedeCambiarEtapa && (
            <DropdownMenuItem className="min-h-11 px-3 text-sm" onSelect={() => setEtapaAbierta(true)}>
              <ArrowRightLeft aria-hidden="true" />
              Cambiar etapa
            </DropdownMenuItem>
          )}
          {turnosDe !== undefined && (
            <DropdownMenuItem className="min-h-11 px-3 text-sm" onSelect={() => setTurnosAbierto(true)}>
              <Clock aria-hidden="true" />
              Turnos
            </DropdownMenuItem>
          )}
          {puedeEditarFicha && (
            <DropdownMenuItem className="min-h-11 px-3 text-sm" onSelect={() => setFichaAbierta(true)}>
              <UserPen aria-hidden="true" />
              Editar ficha
            </DropdownMenuItem>
          )}
          {puedeInvitar && (
            <DropdownMenuItem className="min-h-11 px-3 text-sm" onSelect={() => setInvitarAbierto(true)}>
              <MailPlus aria-hidden="true" />
              Invitar a la plataforma
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild className="min-h-11 px-3 text-sm">
            <Link href={`/dream-team/mi-equipo?direccion=${encodeURIComponent(fila.direccionId)}`}>
              <Users aria-hidden="true" />
              Ver su equipo
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {puedeCambiarEtapa && (
        <AvanceEtapaControl
          servicioId={servicio.id}
          estadoActual={fila.estado}
          version={servicio.version}
          puedeEditar
          abierto={etapaAbierta}
          onAbiertoChange={setEtapaAbierta}
          ocultarBoton
          onSuccess={onActualizado}
        />
      )}

      {turnosDe !== undefined && (
        <TurnosServicioDialog
          servicioId={turnosDe}
          nombre={fila.nombre}
          abierto={turnosAbierto}
          onAbiertoChange={setTurnosAbierto}
          onGuardado={onActualizado}
        />
      )}

      {puedeEditarFicha && (
        <EditarFichaPanel
          personaId={fila.personaId}
          nombre={fila.nombre}
          abierto={fichaAbierta}
          onAbiertoChange={setFichaAbierta}
          onGuardado={onActualizado}
          toast={toast}
        />
      )}

      {puedeInvitar && (
        <InvitarCuentaPanel
          personaId={fila.personaId}
          nombre={fila.nombre}
          abierto={invitarAbierto}
          onAbiertoChange={setInvitarAbierto}
          onInvitada={onActualizado}
        />
      )}
    </>
  )
}
