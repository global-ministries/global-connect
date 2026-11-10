'use client'

/**
 * T8a (odd/tasks/talleres-reserva-publica.md, S9 S14 S15) — the edición page
 * after a suspension (artboard 13, «Después de enviar»): who suspended it and
 * why, the counters Confirmó / Ya no puede / Sin responder, the deadline
 * («Si no confirman antes del …, salen de la edición») and the call list.
 * Each person without an answer has Llamar (tel:), a manual WhatsApp link
 * with the text ready (S14: never sent automatically) and «Marcar como
 * confirmado por teléfono» (talleres_confirmar_por_telefono). The list only
 * comes from the server for coordinators, directors and admins.
 */

import { useState, useTransition, type ReactElement } from 'react'
import { Check, CircleDot, MessageCircle, PauseCircle, Phone, X } from 'lucide-react'

import { BotonSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { confirmarPorTelefono } from '@/lib/platform/talleres/minimo-suspension-actions'
import {
  enlaceWhatsappConTexto,
  fechaCorta,
  mensajeWhatsappCambioFecha,
  type PanelMinimo,
  type PersonaSinResponder,
} from '@/lib/platform/talleres/minimo-suspension'
import { enlaceWhatsapp, esTelefonoReconocible, formatearTelefono, normalizarTelefono } from '@/lib/utils/telefono'

export interface EstadoSuspensionProps {
  readonly tallerSlug: string
  readonly tallerNombre: string
  readonly edicionId: string
  readonly panel: PanelMinimo
}

function fechaHora(valor: string): string {
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return valor
  return d.toLocaleDateString('es', { timeZone: 'America/Caracas', weekday: 'short', day: 'numeric', month: 'short' }).replace(/[,.]/g, '')
}

function enlaceLlamar(telefono: string): string {
  if (esTelefonoReconocible(telefono)) return `tel:+58${(normalizarTelefono(telefono) as string).slice(1)}`
  return `tel:${telefono.replace(/[^\d+]/g, '')}`
}

export function EstadoSuspension({ tallerSlug, tallerNombre, edicionId, panel }: EstadoSuspensionProps): ReactElement {
  const { conteo, suspension } = panel
  const limite = conteo.limite ? fechaCorta(conteo.limite) : null

  return (
    <section aria-labelledby="estado-suspension-titulo" className="flex flex-col gap-4">
      <div className="rounded-2xl border border-info/30 bg-info/10 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <PauseCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-info-text" />
          <div className="min-w-0 flex-1">
            <h2 id="estado-suspension-titulo" className="text-base font-semibold text-foreground">
              {panel.fechaInicio ? `Suspendida · nueva fecha ${fechaCorta(panel.fechaInicio)}` : 'Suspendida'}
            </h2>
            <TextoSistema tamaño="sm" className="mt-1 block">
              {suspension &&
                `La suspendió ${suspension.por ?? 'la dirección'} el ${fechaHora(suspension.en)}${suspension.motivo ? `: «${suspension.motivo}»` : ''}.`}
              {panel.cierreInscripcion && ` La inscripción sigue abierta hasta el ${fechaCorta(panel.cierreInscripcion)}.`}{' '}
              {limite && <strong className="font-semibold">{`Si no confirman antes del ${limite}, salen de la edición.`}</strong>}
            </TextoSistema>
            <ul aria-label="Respuestas al aviso de cambio de fecha" className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <li className="flex items-center gap-1.5">
                <Check aria-hidden="true" className="h-4 w-4 text-success-text" />
                <strong className="font-mono tabular-nums">{conteo.confirmadas}</strong> confirmaron
                {conteo.porTelefono > 0 && (
                  <span className="text-muted-foreground">{` (${conteo.porTelefono} por teléfono)`}</span>
                )}
              </li>
              <li className="flex items-center gap-1.5">
                <X aria-hidden="true" className="h-4 w-4 text-danger-text" />
                <strong className="font-mono tabular-nums">{conteo.noPuede}</strong> no puede
              </li>
              <li className="flex items-center gap-1.5">
                <CircleDot aria-hidden="true" className="h-4 w-4 text-warning-text" />
                <strong className="font-mono tabular-nums">{conteo.sinResponder}</strong> sin responder
              </li>
              {conteo.salieronSinResponder > 0 && (
                <li className="flex items-center gap-1.5 text-muted-foreground">
                  <strong className="font-mono tabular-nums">{conteo.salieronSinResponder}</strong> salieron sin responder
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {panel.puedeConfirmar && panel.sinResponder.length > 0 && (
        <section aria-labelledby="lista-llamadas-titulo" className="rounded-2xl border border-border p-4 sm:p-5">
          <h2 id="lista-llamadas-titulo" className="text-base font-semibold text-foreground">
            {limite ? `Sin responder · llámalos antes del ${limite}` : 'Sin responder'}
          </h2>
          <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
            WhatsApp abre tu chat con el mensaje listo; lo envías tú.
          </TextoSistema>
          <ul className="mt-3 divide-y divide-border">
            {panel.sinResponder.map((p) => (
              <FilaLlamada
                key={p.inscripcionId}
                persona={p}
                tallerSlug={tallerSlug}
                tallerNombre={tallerNombre}
                edicionId={edicionId}
                fechaInicio={panel.fechaInicio}
              />
            ))}
          </ul>
        </section>
      )}
    </section>
  )
}

function FilaLlamada({
  persona,
  tallerSlug,
  tallerNombre,
  edicionId,
  fechaInicio,
}: {
  readonly persona: PersonaSinResponder
  readonly tallerSlug: string
  readonly tallerNombre: string
  readonly edicionId: string
  readonly fechaInicio: string | null
}): ReactElement {
  const notificar = useNotificaciones()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const telefono = persona.telefono ?? persona.companeroTelefono
  const nombreLlamada = persona.telefono ? persona.nombre : persona.companeroNombre ?? persona.nombre
  const whatsapp = telefono && fechaInicio
    ? enlaceWhatsappConTexto(
        enlaceWhatsapp(telefono),
        mensajeWhatsappCambioFecha(nombreLlamada, tallerNombre, fechaInicio, persona.limite),
      )
    : null

  function marcar(): void {
    if (pending) return
    setError(null)
    startTransition(async () => {
      const result = await confirmarPorTelefono({ tallerSlug, edicionId, inscripcionId: persona.inscripcionId })
      if (result.ok) {
        notificar.success(`${persona.nombre} confirmó por teléfono. Mantiene su lugar.`)
      } else {
        setError(result.message)
      }
    })
  }

  return (
    <li className="flex flex-col gap-3 py-3 md:flex-row md:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {persona.nombre}
          {persona.companeroNombre && <span className="text-muted-foreground">{` y ${persona.companeroNombre}`}</span>}
        </p>
        <p className="text-sm text-muted-foreground">
          {telefono ? (
            <span className="font-mono tabular-nums">{formatearTelefono(telefono)}</span>
          ) : (
            'Sin teléfono en su ficha'
          )}
          {` · sale el ${fechaCorta(persona.limite)} si no confirma`}
        </p>
        {error && (
          <p role="alert" className="mt-1 text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {telefono && (
          <BotonSistema asChild variante="outline" tamaño="sm" icono={Phone}>
            <a href={enlaceLlamar(telefono)} aria-label={`Llamar a ${nombreLlamada}`}>
              Llamar
            </a>
          </BotonSistema>
        )}
        {whatsapp && (
          <BotonSistema asChild variante="outline" tamaño="sm" icono={MessageCircle}>
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`Abrir WhatsApp con ${nombreLlamada}`}>
              WhatsApp
            </a>
          </BotonSistema>
        )}
        <BotonSistema type="button" variante="secundario" tamaño="sm" icono={Check} onClick={marcar} cargando={pending}>
          Marcar como confirmado por teléfono
        </BotonSistema>
      </div>
    </li>
  )
}
