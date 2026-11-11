'use client'

/**
 * T8a (odd/tasks/talleres-reserva-publica.md, S9 S16) — the edición page's
 * banner when the inscription closed below the taller's minimum (artboard
 * 13, «No llegó al mínimo para abrir»). Three ways out:
 *   - Suspender y mover a nueva fecha (director/admin: puedeSuspender) →
 *     SuspenderEdicionPanel.
 *   - Abrir igual (S16: only the director and the taller's coordinador,
 *     puedeAbrirIgual) → a confirm dialog that records who and why.
 *   - Cancelar edición: the existing CancelarEdicionButton, passed in by the
 *     page as `cancelar` (it already gates it on editarEdicion).
 * Actions the viewer cannot take are hidden; the RPCs check them again.
 */

import { useState, useTransition, type ReactElement, type ReactNode } from 'react'
import { AlertTriangle, CalendarClock, Lock } from 'lucide-react'

import { BotonSistema, TextareaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { abrirEdicionIgual } from '@/lib/platform/talleres/minimo-suspension-actions'
import { fechaCorta, MOTIVO_MAX, type PanelMinimo } from '@/lib/platform/talleres/minimo-suspension'

import { SuspenderEdicionPanel } from './suspender-edicion-panel'

export interface AvisoMinimoProps {
  readonly tallerSlug: string
  readonly tallerNombre: string
  readonly edicionId: string
  readonly panel: PanelMinimo
  /** The existing «Cancelar esta edición» control, when the viewer may use it. */
  readonly cancelar?: ReactNode
}

export function AvisoMinimo({ tallerSlug, tallerNombre, edicionId, panel, cancelar }: AvisoMinimoProps): ReactElement {
  const [suspenderAbierto, setSuspenderAbierto] = useState(false)
  const minimo = panel.minimo ?? 0
  const aprobados = panel.conteo.aprobados
  const unidad = panel.unidad === 'parejas' ? (aprobados === 1 ? 'pareja aprobada' : 'parejas aprobadas') : aprobados === 1 ? 'inscrito aprobado' : 'inscritos aprobados'

  return (
    <section
      aria-labelledby="aviso-minimo-titulo"
      className="rounded-2xl border border-danger/30 bg-danger/10 p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-danger-text" />
        <div className="min-w-0 flex-1">
          <h2 id="aviso-minimo-titulo" className="text-base font-semibold text-foreground">
            No llegó al mínimo:{' '}
            <span className="font-mono tabular-nums">
              {aprobados} de {minimo}
            </span>
          </h2>
          <TextoSistema tamaño="sm" className="mt-1 block">
            {`La inscripción cerró${panel.cierreInscripcion ? ` el ${fechaCorta(panel.cierreInscripcion)}` : ''} con ${aprobados} ${unidad}; el mínimo de ${tallerNombre} es ${minimo}.`}
            {panel.fechaInicio && ` Decide antes del ${fechaCorta(panel.fechaInicio)}, la primera clase.`} Nadie recibe nada hasta que
            decidas.
          </TextoSistema>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {panel.puedeSuspender && (
              <BotonSistema type="button" icono={CalendarClock} onClick={() => setSuspenderAbierto(true)}>
                Suspender y mover a nueva fecha
              </BotonSistema>
            )}
            {panel.puedeAbrirIgual && (
              <AbrirIgualBoton tallerSlug={tallerSlug} edicionId={edicionId} aprobados={aprobados} minimo={minimo} />
            )}
            {cancelar}
          </div>

          {panel.puedeAbrirIgual && (
            <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
              <Lock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong className="font-medium text-foreground">Abrir igual</strong> solo lo ven la dirección de Conexión y el
                coordinador del taller. Queda en el historial con tu nombre.
              </span>
            </p>
          )}
        </div>
      </div>

      {panel.puedeSuspender && panel.fechaInicio && panel.cierreInscripcion && (
        <SuspenderEdicionPanel
          abierto={suspenderAbierto}
          onAbiertoChange={setSuspenderAbierto}
          tallerSlug={tallerSlug}
          tallerNombre={tallerNombre}
          edicionId={edicionId}
          fechaInicio={panel.fechaInicio}
          cierreInscripcion={panel.cierreInscripcion}
          clases={panel.clases}
          aprobados={aprobados}
          pendientes={panel.conteo.pendientes}
          minimo={minimo}
        />
      )}
    </section>
  )
}

function AbrirIgualBoton({
  tallerSlug,
  edicionId,
  aprobados,
  minimo,
}: {
  readonly tallerSlug: string
  readonly edicionId: string
  readonly aprobados: number
  readonly minimo: number
}): ReactElement {
  const notificar = useNotificaciones()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function confirmar(): void {
    if (pending) return
    setError(null)
    startTransition(async () => {
      const result = await abrirEdicionIgual({ tallerSlug, edicionId, motivo: motivo.trim() || null })
      if (result.ok) {
        setAbierto(false)
        notificar.success(`La edición abre con ${aprobados} de ${minimo}.`)
      } else {
        setError(result.message)
      }
    })
  }

  return (
    <>
      <BotonSistema
        type="button"
        variante="outline"
        onClick={() => {
          setError(null)
          setMotivo('')
          setAbierto(true)
        }}
      >
        Abrir igual con <span className="ml-1 font-mono tabular-nums">{aprobados}</span>
      </BotonSistema>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{`¿Abrir con ${aprobados} de mínimo ${minimo}?`}</DialogTitle>
            <DialogDescription>
              La edición arranca en su fecha con los inscritos que tiene. Queda en el historial con tu nombre.
            </DialogDescription>
          </DialogHeader>
          <TextareaSistema
            label="Motivo (opcional)"
            value={motivo}
            maxLength={MOTIVO_MAX}
            filas={2}
            onChange={(e) => setMotivo(e.target.value)}
          />
          {error && (
            <TextoSistema role="alert" className="block text-danger-text">
              {error}
            </TextoSistema>
          )}
          <div className="flex items-center justify-end gap-2">
            <BotonSistema type="button" variante="outline" onClick={() => setAbierto(false)} disabled={pending}>
              Volver
            </BotonSistema>
            <BotonSistema type="button" onClick={confirmar} cargando={pending}>
              Abrir igual
            </BotonSistema>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
