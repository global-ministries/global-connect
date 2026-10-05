'use client'

/**
 * Talleres — ficha nueva del cónyuge (odd/tasks/talleres-conyuge-invitacion.md
 * C2). Marks an inscription whose partner ficha the member created at
 * enrollment, with the access invitation status, and a "Reenviar acceso"
 * button for writers while the account is not activated yet.
 */

import { useState, useTransition, type ReactElement } from 'react'

import { BadgeSistema, BotonSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import type { InscripcionActionResult } from '@/lib/platform/talleres/inscripciones-actions'

export type ReenviarAccesoAction = (inscripcionId: string) => Promise<InscripcionActionResult>

const ESTADOS_ACCESO: Readonly<Record<string, string>> = {
  pendiente: 'Acceso por enviar',
  enviada: 'Acceso enviado',
  fallida: 'El envío del acceso falló',
  usada: 'Cuenta activada',
  vencida: 'Acceso vencido',
  bloqueada: 'Acceso bloqueado',
  cancelada: 'Acceso cancelado',
}

/** Spanish label for an invitation estado; null when unknown or missing. */
export function estadoAccesoLabel(estado: string | null | undefined): string | null {
  return estado ? (ESTADOS_ACCESO[estado] ?? null) : null
}

export interface AccesoFichaNuevaProps {
  readonly inscripcionId: string
  readonly accesoEstado: string | null | undefined
  readonly puedeReenviar: boolean
  readonly onReenviarAcceso?: ReenviarAccesoAction
}

export function AccesoFichaNueva({
  inscripcionId,
  accesoEstado,
  puedeReenviar,
  onReenviarAcceso,
}: AccesoFichaNuevaProps): ReactElement {
  const [pending, startTransition] = useTransition()
  const [mensaje, setMensaje] = useState<{ readonly ok: boolean; readonly texto: string } | null>(null)
  const estado = estadoAccesoLabel(accesoEstado)
  const mostrarReenvio = puedeReenviar && onReenviarAcceso !== undefined && accesoEstado !== 'usada'

  function reenviar(): void {
    if (pending || !onReenviarAcceso) return
    setMensaje(null)
    startTransition(async () => {
      try {
        const result = await onReenviarAcceso(inscripcionId)
        setMensaje({ ok: result.ok, texto: result.message ?? (result.ok ? 'Acceso reenviado.' : 'No se pudo reenviar.') })
      } catch {
        setMensaje({ ok: false, texto: 'No se pudo reenviar. Inténtalo de nuevo.' })
      }
    })
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <BadgeSistema variante="info" tamaño="sm">
        Ficha nueva creada por el miembro
      </BadgeSistema>
      {estado && (
        <TextoSistema variante="sutil" className="text-xs">
          {estado}
        </TextoSistema>
      )}
      {mostrarReenvio && (
        <BotonSistema type="button" variante="outline" tamaño="sm" cargando={pending} onClick={reenviar}>
          Reenviar acceso
        </BotonSistema>
      )}
      {mensaje && (
        <TextoSistema role={mensaje.ok ? 'status' : 'alert'} className="text-xs">
          {mensaje.texto}
        </TextoSistema>
      )}
    </div>
  )
}
