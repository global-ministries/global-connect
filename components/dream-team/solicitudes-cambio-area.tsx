'use client'

/**
 * "Solicitudes de cambio de área" (odd/tasks/dream-team-cambiar-area.md, T2,
 * T3, S5, S7): a card on Mi equipo, the screen where Dream Team directors and
 * coordinators work, with the requests of dream_team_solicitudes_cambio_area()
 * the server page read — the pending ones the viewer resolves as a director of
 * both áreas or the Atención al Voluntario coordinator ("Aprobar" /
 * "Rechazar", with an optional answer) and the viewer's own with their estado
 * and the answer. Renders nothing without requests.
 *
 * Resolving POSTs /api/dream-team/solicitudes-cambio-area/[id]; the database
 * checks the authority and that the servicio did not change, and its Spanish
 * message is shown in the dialog. After a decision the screen refreshes.
 */
import { useState, type ReactElement } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BotonSistema, TarjetaSistema, TextareaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { PuntoEstado, type TonoEstado } from '@/components/ui/punto-estado'
import type { useNotificaciones } from '@/hooks/use-notificaciones'
import { formatearFecha } from '@/components/dream-team/detalle-persona'
import {
  ESTADO_SOLICITUD_LABELS,
  MOTIVO_CAMBIO_AREA_LABELS,
  NOTA_CAMBIO_AREA_MAX,
  type EstadoSolicitudCambioArea,
  type SolicitudCambioArea,
} from '@/lib/platform/dream-team/cambiar-area'

const TONO_SOLICITUD: Readonly<Record<EstadoSolicitudCambioArea, TonoEstado>> = {
  pendiente: 'warning',
  aprobada: 'success',
  rechazada: 'danger',
  anulada: 'muted',
}

const ultimo = (ruta: string): string => ruta.split(' › ').pop() ?? ruta

export interface SolicitudesCambioAreaProps {
  readonly solicitudes: readonly SolicitudCambioArea[]
  /** After a decision: refresh the server data. */
  readonly onResuelta: () => void
  readonly toast: Pick<ReturnType<typeof useNotificaciones>, 'success'>
}

type Decision = { readonly solicitud: SolicitudCambioArea; readonly aprobar: boolean } | null

function Resolucion({ solicitud }: { readonly solicitud: SolicitudCambioArea }): ReactElement | null {
  if (solicitud.estado === 'pendiente' || !solicitud.resueltoPorNombre) return null
  const fecha = solicitud.resueltaEn ? ` · ${formatearFecha(solicitud.resueltaEn)}` : ''
  return (
    <TextoSistema variante="sutil" tamaño="sm">
      {solicitud.respuesta
        ? `Respondió ${solicitud.resueltoPorNombre}: «${solicitud.respuesta}»${fecha}`
        : `Resolvió ${solicitud.resueltoPorNombre}${fecha}`}
    </TextoSistema>
  )
}

export function SolicitudesCambioArea({ solicitudes, onResuelta, toast }: SolicitudesCambioAreaProps): ReactElement | null {
  const [decision, setDecision] = useState<Decision>(null)
  const [respuesta, setRespuesta] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (solicitudes.length === 0) return null
  const porResolver = solicitudes.filter((s) => s.puedeResolver).length

  function abrir(solicitud: SolicitudCambioArea, aprobar: boolean): void {
    setDecision({ solicitud, aprobar })
    setRespuesta('')
    setError(null)
  }

  async function resolver(): Promise<void> {
    if (!decision || enviando) return
    const { solicitud, aprobar } = decision
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch(`/api/dream-team/solicitudes-cambio-area/${encodeURIComponent(solicitud.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aprobar, respuesta: respuesta.trim() || null }),
      })
      if (!res.ok) {
        const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
        setError(cuerpo?.error ?? 'No se pudo resolver la solicitud.')
        return
      }
      toast.success(aprobar ? `${solicitud.personaNombre} pasó a ${ultimo(solicitud.destinoRuta)}.` : 'Solicitud rechazada.')
      setDecision(null)
      onResuelta()
    } catch {
      setError('No se pudo resolver la solicitud.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <TarjetaSistema role="region" aria-labelledby="solicitudes-cambio-area" className="space-y-3 p-4">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
        <h2 id="solicitudes-cambio-area" className="text-base font-semibold text-foreground">
          Solicitudes de cambio de área
        </h2>
        {porResolver > 0 && (
          <TextoSistema variante="sutil" tamaño="sm">
            <span className="font-mono tabular-nums">{porResolver}</span> por resolver
          </TextoSistema>
        )}
      </div>
      <ul className="divide-y divide-border">
        {solicitudes.map((solicitud) => (
          <li key={solicitud.id} aria-label={solicitud.personaNombre} className="grid gap-1 py-3 first:pt-0 last:pb-0">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <p className="truncate font-semibold text-foreground">{solicitud.personaNombre}</p>
              <PuntoEstado tono={TONO_SOLICITUD[solicitud.estado]} etiqueta={ESTADO_SOLICITUD_LABELS[solicitud.estado]} />
            </div>
            <p className="text-sm text-foreground">
              {`${solicitud.origenRuta} (${solicitud.rolOrigen}) → ${solicitud.destinoRuta} (${solicitud.rolDestino})`}
            </p>
            <TextoSistema variante="sutil" tamaño="sm">
              {`${MOTIVO_CAMBIO_AREA_LABELS[solicitud.motivo]} · Pidió ${solicitud.solicitanteNombre} · ${formatearFecha(solicitud.creadaEn)}`}
            </TextoSistema>
            {solicitud.nota && <TextoSistema tamaño="sm">{`«${solicitud.nota}»`}</TextoSistema>}
            <Resolucion solicitud={solicitud} />
            {solicitud.puedeResolver && (
              <div className="mt-1 flex flex-wrap gap-2">
                <BotonSistema type="button" tamaño="sm" onClick={() => abrir(solicitud, true)}>
                  Aprobar
                </BotonSistema>
                <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => abrir(solicitud, false)}>
                  Rechazar
                </BotonSistema>
              </div>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={decision !== null} onOpenChange={(open) => !open && !enviando && setDecision(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{decision?.aprobar ? 'Aprobar el cambio de área' : 'Rechazar la solicitud'}</DialogTitle>
            <DialogDescription>
              {decision?.aprobar
                ? `${decision.solicitud.personaNombre} pasa a ${decision.solicitud.destinoRuta} como ${decision.solicitud.rolDestino}, en la misma etapa.`
                : `${decision?.solicitud.personaNombre ?? ''} sigue en ${decision?.solicitud.origenRuta ?? ''}.`}
            </DialogDescription>
          </DialogHeader>
          <TextareaSistema
            label="Respuesta (opcional)"
            filas={2}
            maxLength={NOTA_CAMBIO_AREA_MAX}
            value={respuesta}
            onChange={(e) => setRespuesta(e.target.value)}
            disabled={enviando}
          />
          {error && (
            <TextoSistema role="alert" tamaño="sm" className="text-danger-text">
              {error}
            </TextoSistema>
          )}
          <DialogFooter>
            <BotonSistema type="button" variante="outline" disabled={enviando} onClick={() => setDecision(null)}>
              Cancelar
            </BotonSistema>
            <BotonSistema
              type="button"
              cargando={enviando}
              onClick={() => {
                void resolver()
              }}
            >
              {decision?.aprobar ? 'Aprobar cambio' : 'Rechazar solicitud'}
            </BotonSistema>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TarjetaSistema>
  )
}
