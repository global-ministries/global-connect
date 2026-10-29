'use client'

/**
 * Mi equipo — the person panel (S11 decision 1 of odd/tasks/sistema-diseno-v2.md):
 * the shared `DetallePersona` (components/dream-team/detalle-persona.tsx) fed
 * with every servicio of the person in the dirección (`vista.fichas`), not
 * just those the filters leave. It replaces the per-servicio "⋯" menu: each
 * action follows `accionesPersonaMiEquipo` (the viewer's role narrowed by
 * what the server granted per servicio), so the director changes the stage,
 * the coordinador fixes fichas, shifts and invites but never the stage, and a
 * Grupos de Vida servicio stays read-only. The server checks each action again.
 *
 * The dialogs are the ones the old menu opened (AvanceEtapaControl,
 * TurnosServicioDialog, EditarFichaPanel, InvitarCuentaPanel). They live
 * outside the panel: choosing an action closes it first, so two modals never
 * fight for focus.
 */
import { useState, type ReactElement } from 'react'

import { DetallePersona, type ServicioDetalle } from '@/components/dream-team/detalle-persona'
import { AvanceEtapaControl } from '@/components/dream-team/avance-etapa-control'
import { TurnosServicioDialog } from '@/components/dream-team/turnos/turnos-servicio-dialog'
import { EditarFichaPanel } from '@/components/dream-team/servidores/editar-ficha-panel'
import { InvitarCuentaPanel } from '@/components/cuentas/invitar-cuenta-panel'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import type { RolMiEquipo } from '@/lib/platform/dream-team/acciones-servicio'
import { RANGO_EDAD_LABELS } from '@/lib/platform/dream-team/edad'
import { isoLocal } from '@/lib/platform/dream-team/frecuencia-turno'
import { accionesPersonaMiEquipo, textoTurnosMiEquipo, type TurnoMiEquipo } from '@/lib/platform/dream-team/mi-equipo-filtros'
import type { PersonaAgrupada, PersonaVista } from '@/lib/platform/dream-team/mi-equipo-vista'

type Accion = { readonly tipo: 'etapa' | 'turnos'; readonly servicio: PersonaVista } | { readonly tipo: 'ficha' | 'invitar' } | null

export interface DetalleMiEquipoProps {
  /** The person with every servicio in the dirección; `null` keeps the panel closed. */
  readonly persona: PersonaAgrupada | null
  readonly abierto: boolean
  readonly onCambioAbierto: (abierto: boolean) => void
  readonly rol: RolMiEquipo
  readonly turnos: readonly TurnoMiEquipo[]
  /** The visible ancestors of a servicio's equipo ("Dirección de Conexión › Talleres"); empty at the dirección. */
  readonly rutaDe: (servicio: PersonaVista) => string
  /** The level "Ver su equipo" goes to; `undefined` hides it (already there). */
  readonly nivelDe: (servicio: PersonaVista) => string | null | undefined
  readonly onVerEquipo: (nivel: string | null) => void
  /** After a saved change: refresh the server data. */
  readonly onActualizado: () => void
}

export function DetalleMiEquipo({
  persona,
  abierto,
  onCambioAbierto,
  rol,
  turnos,
  rutaDe,
  nivelDe,
  onVerEquipo,
  onActualizado,
}: DetalleMiEquipoProps): ReactElement | null {
  const [accion, setAccion] = useState<Accion>(null)
  const toast = useNotificaciones()
  if (persona === null) return null

  const hoy = isoLocal(new Date())
  const acciones = persona.servicios.map((servicio) => accionesPersonaMiEquipo(servicio, rol))
  const editarFicha = acciones.some((a) => a.editarFicha)
  const invitar = acciones.some((a) => a.invitar)
  const servicioDe = (clave: string) => persona.servicios.find((servicio) => servicio.clave === clave)
  const rango = persona.servicios.find((servicio) => servicio.rangoEdad !== undefined)?.rangoEdad

  function aServicio(servicio: PersonaVista): ServicioDetalle {
    const permitido = accionesPersonaMiEquipo(servicio, rol)
    return {
      clave: servicio.clave,
      equipoLabel: servicio.equipoLabel,
      equipoRuta: rutaDe(servicio),
      rolLabel: servicio.rolLabel,
      estado: servicio.estado,
      turnoTexto: servicio.origen === 'dream_team' ? textoTurnosMiEquipo(servicio, turnos, hoy) : '—',
      origen: servicio.origen,
      acciones: {
        cambiarEtapa: permitido.cambiarEtapa,
        turnos: permitido.turnosDe !== undefined,
        editarFicha: permitido.editarFicha,
        invitar: permitido.invitar,
        irAEquipo: nivelDe(servicio) !== undefined,
      },
    }
  }

  function cerrarAccion(abierta: boolean): void {
    if (!abierta) setAccion(null)
  }
  function guardado(): void {
    setAccion(null)
    onActualizado()
  }
  function elegirServicio(tipo: 'etapa' | 'turnos', clave: string): void {
    const servicio = servicioDe(clave)
    if (servicio) setAccion({ tipo, servicio })
  }
  function verEquipo(clave: string): void {
    const servicio = servicioDe(clave)
    const nivel = servicio ? nivelDe(servicio) : undefined
    if (nivel !== undefined) onVerEquipo(nivel)
  }

  const servicioAccion = accion !== null && 'servicio' in accion ? accion.servicio : null
  const permitidoAccion = servicioAccion ? accionesPersonaMiEquipo(servicioAccion, rol) : null

  return (
    <>
      <DetallePersona
        persona={{ ...persona, edad: rango ? RANGO_EDAD_LABELS[rango] : undefined }}
        servicios={persona.servicios.map(aServicio)}
        abierto={abierto}
        onCambioAbierto={onCambioAbierto}
        onCambiarEtapa={(clave) => elegirServicio('etapa', clave)}
        onTurnos={(clave) => elegirServicio('turnos', clave)}
        onEditarFicha={() => setAccion({ tipo: 'ficha' })}
        onInvitar={() => setAccion({ tipo: 'invitar' })}
        onVerEquipo={verEquipo}
      />

      {servicioAccion && permitidoAccion?.servicio && accion?.tipo === 'etapa' && (
        <AvanceEtapaControl
          servicioId={permitidoAccion.servicio.id}
          estadoActual={servicioAccion.estado}
          version={permitidoAccion.servicio.version}
          puedeEditar
          abierto
          onAbiertoChange={cerrarAccion}
          ocultarBoton
          onSuccess={guardado}
        />
      )}

      {servicioAccion && permitidoAccion?.turnosDe !== undefined && accion?.tipo === 'turnos' && (
        <TurnosServicioDialog
          servicioId={permitidoAccion.turnosDe}
          nombre={persona.nombre}
          abierto
          onAbiertoChange={cerrarAccion}
          onGuardado={guardado}
        />
      )}

      {editarFicha && (
        <EditarFichaPanel
          personaId={persona.personaId}
          nombre={persona.nombre}
          abierto={accion?.tipo === 'ficha'}
          onAbiertoChange={cerrarAccion}
          onGuardado={guardado}
          toast={toast}
        />
      )}

      {invitar && (
        <InvitarCuentaPanel
          personaId={persona.personaId}
          nombre={persona.nombre}
          abierto={accion?.tipo === 'invitar'}
          onAbiertoChange={cerrarAccion}
          onInvitada={guardado}
        />
      )}
    </>
  )
}
