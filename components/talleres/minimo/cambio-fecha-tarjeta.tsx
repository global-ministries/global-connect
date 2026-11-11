'use client'

/**
 * T8a (odd/tasks/talleres-reserva-publica.md, S9 S15) — the member's
 * «Tu taller cambió de fecha» card on Mi Recorrido (artboards 09 and 11):
 * the previous and new start, where, the director's message and the
 * deadline, with «Mantener mi lugar» and «Ya no puedo» (which asks once
 * more, since it leaves the edición). Answers through responderCambioFecha;
 * the RPC only accepts the principal or companero, before the limit.
 */

import { useState, useTransition, type ReactElement } from 'react'
import { CalendarClock, Check } from 'lucide-react'

import { BotonSistema, TextareaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { responderCambioFecha } from '@/lib/platform/talleres/minimo-suspension-actions'
import { fechaLarga, MOTIVO_MAX, type CambioDeFecha } from '@/lib/platform/talleres/minimo-suspension'

export function CambioFechaTarjeta({ cambio }: { readonly cambio: CambioDeFecha }): ReactElement {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [respuesta, setRespuesta] = useState<'confirmada' | 'no_puede' | null>(null)
  const [confirmarSalida, setConfirmarSalida] = useState(false)
  const [motivo, setMotivo] = useState('')
  const tituloId = `cambio-fecha-${cambio.inscripcionId}`

  function responder(valor: 'mantener' | 'no_puedo'): void {
    if (pending) return
    setError(null)
    startTransition(async () => {
      const r = await responderCambioFecha({
        inscripcionId: cambio.inscripcionId,
        respuesta: valor,
        motivo: valor === 'no_puedo' ? motivo.trim() || null : null,
      })
      if (r.ok) {
        setConfirmarSalida(false)
        setRespuesta(r.confirmacion)
      } else {
        setError(r.message)
      }
    })
  }

  if (respuesta) {
    return (
      <section aria-labelledby={tituloId} className="rounded-2xl border border-border p-4" role="status">
        <h2 id={tituloId} className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Check aria-hidden="true" className="h-5 w-5 text-success-text" />
          {respuesta === 'confirmada' ? 'Listo, mantienes tu lugar' : 'Listo, saliste de esta edición'}
        </h2>
        <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
          {respuesta === 'confirmada'
            ? `${cambio.tallerNombre} empieza el ${fechaLarga(cambio.fechaInicio)}.`
            : 'Gracias por avisarnos. Puedes inscribirte de nuevo cuando abra otra edición.'}
        </TextoSistema>
      </section>
    )
  }

  return (
    <section aria-labelledby={tituloId} className="rounded-2xl border border-info/30 bg-info/10 p-4">
      <div className="flex items-start gap-3">
        <CalendarClock aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-info-text" />
        <div className="min-w-0 flex-1">
          <TextoSistema variante="sutil" tamaño="sm" className="block">
            {cambio.tallerNombre}
          </TextoSistema>
          <h2 id={tituloId} className="text-base font-semibold text-foreground">
            Tu taller cambió de fecha
          </h2>
          {cambio.mensaje && (
            <TextoSistema tamaño="sm" className="mt-1 block">
              {cambio.mensaje}
            </TextoSistema>
          )}
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
            {cambio.fechaAnterior && (
              <>
                <dt className="text-muted-foreground">Antes</dt>
                <dd className="text-muted-foreground line-through">{fechaLarga(cambio.fechaAnterior)}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Ahora</dt>
            <dd className="font-medium text-foreground">{fechaLarga(cambio.fechaInicio)}</dd>
            {cambio.lugar && (
              <>
                <dt className="text-muted-foreground">Lugar</dt>
                <dd className="text-foreground">{cambio.lugar}</dd>
              </>
            )}
          </dl>
          <TextoSistema tamaño="sm" className="mt-3 block font-medium">
            {`Confirma antes del ${fechaLarga(cambio.limite)} para mantener tu lugar.`}
          </TextoSistema>
          <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
            Si no confirmas, sales de la edición y tu cupo pasa a otra persona.
          </TextoSistema>
          {error && !confirmarSalida && (
            <TextoSistema role="alert" tamaño="sm" className="mt-2 block text-danger-text">
              {error}
            </TextoSistema>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <BotonSistema type="button" onClick={() => responder('mantener')} cargando={pending && !confirmarSalida}>
              Mantener mi lugar
            </BotonSistema>
            <BotonSistema
              type="button"
              variante="outline"
              onClick={() => {
                setError(null)
                setMotivo('')
                setConfirmarSalida(true)
              }}
              disabled={pending}
            >
              Ya no puedo
            </BotonSistema>
          </div>
        </div>
      </div>

      <Dialog open={confirmarSalida} onOpenChange={setConfirmarSalida}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Seguro que ya no puedes?</DialogTitle>
            <DialogDescription>
              {`Sales de esta edición de ${cambio.tallerNombre} y tu cupo pasa a otra persona. No se puede deshacer desde aquí.`}
            </DialogDescription>
          </DialogHeader>
          <TextareaSistema
            label="¿Quieres contarnos por qué? (opcional)"
            value={motivo}
            maxLength={MOTIVO_MAX}
            filas={2}
            onChange={(e) => setMotivo(e.target.value)}
          />
          {error && (
            <TextoSistema role="alert" tamaño="sm" className="block text-danger-text">
              {error}
            </TextoSistema>
          )}
          <div className="flex items-center justify-end gap-2">
            <BotonSistema type="button" variante="outline" onClick={() => setConfirmarSalida(false)} disabled={pending}>
              Volver
            </BotonSistema>
            <BotonSistema type="button" variante="peligro" onClick={() => responder('no_puedo')} cargando={pending}>
              Sí, ya no puedo
            </BotonSistema>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
