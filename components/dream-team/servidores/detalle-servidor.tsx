'use client'

/**
 * Servidores — the person detail drawer (docs/design-system/patterns.md#detail-drawer):
 * the shared `DetallePersona` (components/dream-team/detalle-persona.tsx), fed
 * with the person's `FilaVista` rows. Every action follows `accionesDeServicio`
 * (lib/platform/dream-team/acciones-servicio.ts), the same rule the menu
 * applied, so a Grupos de Vida row stays read-only and a retired servicio
 * offers no stage or shift change. The server checks each action again.
 *
 * The action dialogs live outside the drawer: choosing one closes the drawer
 * and opens the dialog, so two modals never fight for focus.
 *
 * The invitation to register (invitaciones pendientes T4, S7): "Reenviar
 * invitación" resends to the same email with the drawer open; "Cambiar
 * correo" opens `InvitarCuentaPanel`; "Cancelar invitación" asks first.
 */
import { useState, type ReactElement } from 'react'

import { DetallePersona, type ServicioDetalle } from '@/components/dream-team/detalle-persona'
import { AvanceEtapaControl } from '@/components/dream-team/avance-etapa-control'
import { TurnosServicioDialog } from '@/components/dream-team/turnos/turnos-servicio-dialog'
import { InvitarCuentaPanel } from '@/components/cuentas/invitar-cuenta-panel'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { accionesDeServicio } from '@/lib/platform/dream-team/acciones-servicio'
import type { FilaVista, PersonaLista } from '@/lib/platform/dream-team/servidores-vista'
import { EditarFichaPanel } from './editar-ficha-panel'
import { DialogoCancelarInvitacion, cancelarInvitacion, reenviarInvitacion } from './invitaciones-servidores'

export { formatearFecha } from '@/components/dream-team/detalle-persona'

type Accion =
  | { readonly tipo: 'etapa' | 'turnos'; readonly fila: FilaVista }
  | { readonly tipo: 'ficha' | 'invitar' | 'cancelarInvitacion' }
  | null

export interface DetalleServidorProps {
  /** The person with every servicio; `null` keeps the drawer closed. */
  readonly persona: PersonaLista | null
  readonly abierto: boolean
  readonly onCambioAbierto: (abierto: boolean) => void
  /** After a saved change: refresh the server data. */
  readonly onActualizado: () => void
}

function aServicio(fila: FilaVista): ServicioDetalle {
  const acciones = accionesDeServicio(fila)
  return {
    clave: fila.clave,
    equipoLabel: fila.equipoLabel,
    equipoNombre: fila.equipoNombre,
    equipoRuta: fila.equipoRuta,
    rolLabel: fila.rolLabel,
    estado: fila.estado,
    turnoTexto: fila.turnosTexto,
    desde: fila.fechaInicio,
    origen: fila.origen,
    acciones: {
      cambiarEtapa: acciones.cambiarEtapa,
      turnos: acciones.turnosDe !== undefined,
      editarFicha: acciones.editarFicha,
      invitar: acciones.invitar,
      // Without any action there is not even "Ver su equipo".
      verEquipo: acciones.alguna ? `/dream-team/mi-equipo?direccion=${encodeURIComponent(fila.direccionId)}` : undefined,
    },
  }
}

export function DetalleServidor({ persona, abierto, onCambioAbierto, onActualizado }: DetalleServidorProps): ReactElement | null {
  const [accion, setAccion] = useState<Accion>(null)
  const [ocupado, setOcupado] = useState(false)
  const toast = useNotificaciones()
  if (persona === null) return null

  const acciones = persona.filas.map(accionesDeServicio)
  const editarFicha = acciones.some((a) => a.editarFicha)
  const invitar = acciones.some((a) => a.invitar)
  const filaDe = (clave: string) => persona.filas.find((fila) => fila.clave === clave)

  function cerrarAccion(abierta: boolean): void {
    if (!abierta) setAccion(null)
  }
  function guardado(): void {
    setAccion(null)
    onActualizado()
  }
  function elegirFila(tipo: 'etapa' | 'turnos', clave: string): void {
    const fila = filaDe(clave)
    if (fila) setAccion({ tipo, fila })
  }

  async function reenviar(): Promise<void> {
    if (persona === null || !persona.invitacion || ocupado) return
    setOcupado(true)
    const resultado = await reenviarInvitacion(persona.clave, persona.invitacion.email)
    setOcupado(false)
    if (!resultado.ok) {
      toast.error(resultado.error)
      return
    }
    toast.success(`Invitación para registrarse reenviada a ${resultado.email}.`)
    onActualizado()
  }

  async function cancelar(): Promise<void> {
    if (persona === null || ocupado) return
    setOcupado(true)
    const error = await cancelarInvitacion(persona.clave)
    setOcupado(false)
    setAccion(null)
    if (error !== null) {
      toast.error(error)
      return
    }
    toast.success('Invitación a la plataforma cancelada.')
    onActualizado()
  }

  const filaAccion = accion !== null && 'fila' in accion ? accion.fila : null
  const servicioAccion = filaAccion ? accionesDeServicio(filaAccion) : null

  return (
    <>
      <DetallePersona
        persona={persona}
        servicios={persona.filas.map(aServicio)}
        abierto={abierto}
        onCambioAbierto={onCambioAbierto}
        onCambiarEtapa={(clave) => elegirFila('etapa', clave)}
        onTurnos={(clave) => elegirFila('turnos', clave)}
        onEditarFicha={() => setAccion({ tipo: 'ficha' })}
        onInvitar={() => setAccion({ tipo: 'invitar' })}
        onReenviarInvitacion={reenviar}
        onCancelarInvitacion={() => setAccion({ tipo: 'cancelarInvitacion' })}
        reenviandoInvitacion={ocupado}
      />

      {filaAccion && servicioAccion?.servicio && accion?.tipo === 'etapa' && (
        <AvanceEtapaControl
          servicioId={servicioAccion.servicio.id}
          estadoActual={filaAccion.estado}
          version={servicioAccion.servicio.version}
          puedeEditar
          abierto
          onAbiertoChange={cerrarAccion}
          ocultarBoton
          onSuccess={guardado}
        />
      )}

      {filaAccion && servicioAccion?.turnosDe !== undefined && accion?.tipo === 'turnos' && (
        <TurnosServicioDialog
          servicioId={servicioAccion.turnosDe}
          nombre={persona.nombre}
          abierto
          onAbiertoChange={cerrarAccion}
          onGuardado={guardado}
        />
      )}

      {editarFicha && (
        <EditarFichaPanel
          personaId={persona.clave}
          nombre={persona.nombre}
          abierto={accion?.tipo === 'ficha'}
          onAbiertoChange={cerrarAccion}
          onGuardado={guardado}
          toast={toast}
        />
      )}

      {invitar && (
        <InvitarCuentaPanel
          personaId={persona.clave}
          nombre={persona.nombre}
          abierto={accion?.tipo === 'invitar'}
          onAbiertoChange={cerrarAccion}
          onInvitada={guardado}
        />
      )}

      {invitar && (
        <DialogoCancelarInvitacion
          abierto={accion?.tipo === 'cancelarInvitacion'}
          titulo={`¿Cancelar la invitación de ${persona.nombre}?`}
          descripcion="El enlace que recibió deja de funcionar. Puedes volver a invitar a esta persona cuando quieras."
          confirmar="Cancelar invitación"
          ocupado={ocupado}
          onConfirmar={cancelar}
          onCerrar={() => setAccion(null)}
        />
      )}
    </>
  )
}
