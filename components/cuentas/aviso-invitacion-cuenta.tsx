'use client'

/**
 * The invitation to register in a person drawer (T4 of
 * odd/tasks/invitaciones-pendientes.md, S2 and S7; artboard
 * design/invitaciones/05-mezcla-escritorio.html, `bloqueInvitacion`).
 *
 * One callout per state: vencida ("Todavía no creó su cuenta", with
 * Reenviar invitación, Cambiar correo and Avisar por WhatsApp), enviada
 * ("Invitación para registrarse enviada hace …", with Cambiar correo and
 * WhatsApp) and registrada ("Ya se registró en la plataforma"). Below it the
 * note about the email, the history and, for an open invitation, "Cancelar
 * invitación". The actions show only when `puedeInvitar`; the server checks
 * each one again. Sin invitar keeps the drawer's "No tiene cuenta" callout;
 * after a cancelled invitation the drawer adds `HistorialInvitacion`.
 */
import type { ReactElement } from 'react'
import { Mail, MessageCircle, Send } from 'lucide-react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import type { ResumenInvitacion } from '@/lib/platform/cuentas/invitaciones-pendientes'
import { enlaceWhatsapp } from '@/lib/utils/telefono'

import { AVISO_WHATSAPP, NOTA_CORREO, entradasHistorial, fechaCorta, hace } from './textos-invitacion'

export interface AvisoInvitacionCuentaProps {
  /** A 'vencida', 'enviada' or 'registrada' invitation. */
  readonly invitacion: ResumenInvitacion
  readonly telefono: string | null
  readonly puedeInvitar: boolean
  readonly onReenviar: () => void
  readonly onCambiarCorreo: () => void
  readonly onCancelar: () => void
  readonly reenviando?: boolean
  readonly ahora?: Date
}

export function HistorialInvitacion({ invitacion }: { readonly invitacion: ResumenInvitacion }): ReactElement | null {
  const entradas = entradasHistorial(invitacion)
  if (entradas.length === 0) return null
  return (
    <section className="space-y-3">
      <h3 id="historial-invitacion" className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
        Historial de la invitación a la plataforma
      </h3>
      <ol aria-labelledby="historial-invitacion" className="space-y-3">
        {entradas.map((entrada, i) => (
          <li key={i} className="flex min-w-0 items-start gap-3 text-sm">
            <PuntoEstado tono={entrada.tono} className="mt-1.5" />
            <div className="min-w-0">
              <p className="text-foreground">
                {entrada.texto}
                {entrada.email && (
                  <>
                    {' '}
                    <span className="break-all font-medium">{entrada.email}</span>
                  </>
                )}
              </p>
              <p className="text-xs text-muted-foreground">{entrada.detalle}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function AvisoInvitacionCuenta({
  invitacion,
  telefono,
  puedeInvitar,
  onReenviar,
  onCambiarCorreo,
  onCancelar,
  reenviando = false,
  ahora = new Date(),
}: AvisoInvitacionCuentaProps): ReactElement {
  const whatsapp = enlaceWhatsapp(telefono)
  const correo = <span className="break-all font-medium text-foreground">{invitacion.email}</span>
  const avisar =
    puedeInvitar && whatsapp ? (
      <BotonSistema asChild variante="outline" tamaño="sm" icono={MessageCircle}>
        <a href={`${whatsapp}?text=${encodeURIComponent(AVISO_WHATSAPP)}`} target="_blank" rel="noopener noreferrer">
          Avisar por WhatsApp
        </a>
      </BotonSistema>
    ) : null
  const cambiarCorreo = (
    <BotonSistema type="button" variante="outline" tamaño="sm" icono={Mail} onClick={onCambiarCorreo}>
      Cambiar correo
    </BotonSistema>
  )
  const cancelar = puedeInvitar ? (
    <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={onCancelar} className="self-start">
      Cancelar invitación
    </BotonSistema>
  ) : null

  if (invitacion.estado === 'registrada') {
    return (
      <div className="space-y-5">
        <AvisoFormulario tono="info" className="space-y-1">
          <p className="font-semibold text-foreground">Ya se registró en la plataforma</p>
          <p>
            {`Entró el ${fechaCorta(invitacion.aceptadaEl ?? invitacion.enviadaEl)} con `}
            {correo}. Ve sus turnos y recibe recordatorios.
          </p>
        </AvisoFormulario>
        <HistorialInvitacion invitacion={invitacion} />
      </div>
    )
  }

  if (invitacion.estado === 'enviada') {
    return (
      <div className="flex flex-col gap-5">
        <AvisoFormulario tono="info" className="space-y-2">
          <p className="font-semibold text-foreground">{`Invitación para registrarse enviada ${hace(invitacion.enviadaEl, ahora)}`}</p>
          <p>Todavía no creó su cuenta. El enlace sigue vigente unas horas más; si no le llegó, revisa el correo.</p>
          {puedeInvitar && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {cambiarCorreo}
              {avisar}
            </div>
          )}
        </AvisoFormulario>
        <HistorialInvitacion invitacion={invitacion} />
        {cancelar}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <AvisoFormulario tono="marca" className="space-y-2">
        <p className="font-semibold text-foreground">Todavía no creó su cuenta</p>
        <p>
          La invitación para registrarse en Global Connect le llegó a {correo}
          {` ${hace(invitacion.enviadaEl, ahora)} y el enlace ya venció. Reenvíala y avísale que revise también la carpeta de spam.`}
        </p>
        {puedeInvitar && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <BotonSistema type="button" tamaño="sm" icono={Send} cargando={reenviando} onClick={onReenviar}>
              Reenviar invitación
            </BotonSistema>
            {cambiarCorreo}
            {avisar}
          </div>
        )}
      </AvisoFormulario>
      <p className="text-[13px] text-muted-foreground">{NOTA_CORREO}</p>
      <HistorialInvitacion invitacion={invitacion} />
      {cancelar}
    </div>
  )
}
