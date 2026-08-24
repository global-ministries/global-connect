'use client'

/**
 * Client controls for resolving a pending withdrawal request
 * (`taller_solicitudes_retiro`) inline from the coordinator / dirección
 * solicitudes surfaces.
 *
 * Both server actions are passed as props (`onAprobar`, `onRechazar`) so
 * the component stays page-agnostic — the coordination page wires the
 * scoped actions, and a dirección page could wire the same (the RPC is
 * the security wall, confining a coordinator to their equipo).
 *
 * UX — both actions are CONSEQUENTIAL, so each sits behind its own
 * confirm gate (a single click never resolves a solicitud):
 *   - Idle: "Aprobar" + "Rechazar".
 *   - Clicking one swaps to "Confirmar …" + "Cancelar"; the other option
 *     is hidden so the pending decision is unambiguous.
 *   - Confirm runs the action inside a transition (disabled while
 *     pending); success resets to idle and shows a role="status" note,
 *     failure keeps the gate open and shows a role="alert" note.
 *
 * No motivo is captured: the RPC's reject branch ignores `p_motivo`
 * entirely, and approve derives its own — so the app always sends null.
 *
 * Pattern sibling: `components/talleres/inscripcion-actions.tsx`.
 */

import { useState, useTransition, type ReactElement } from 'react'
import { Check, X } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'

import type { SolicitudRetiroActionResult } from '@/lib/platform/talleres/solicitudes-retiro-actions'

export type SolicitudRetiroResolveAction = (
  solicitudId: string,
) => Promise<SolicitudRetiroActionResult>

interface ResolverSolicitudRetiroControlsProps {
  readonly solicitudId: string
  readonly onAprobar: SolicitudRetiroResolveAction
  readonly onRechazar: SolicitudRetiroResolveAction
}

type ConfirmMode = 'none' | 'aprobar' | 'rechazar'

type FeedbackState = {
  readonly kind: 'idle' | 'error' | 'success'
  readonly message?: string
}

const idleFeedback: FeedbackState = { kind: 'idle' }

export function ResolverSolicitudRetiroControls({
  solicitudId,
  onAprobar,
  onRechazar,
}: ResolverSolicitudRetiroControlsProps): ReactElement {
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<FeedbackState>(idleFeedback)
  const [confirming, setConfirming] = useState<ConfirmMode>('none')

  function beginConfirm(mode: Exclude<ConfirmMode, 'none'>): void {
    setFeedback(idleFeedback)
    setConfirming(mode)
  }

  function cancel(): void {
    if (pending) return
    setConfirming('none')
    setFeedback(idleFeedback)
  }

  function submit(): void {
    if (pending) return
    const mode = confirming
    if (mode === 'none') return
    setFeedback(idleFeedback)
    startTransition(async () => {
      const action = mode === 'aprobar' ? onAprobar : onRechazar
      const result = await action(solicitudId)
      if (result.ok) {
        setFeedback({ kind: 'success', message: result.message })
        setConfirming('none')
      } else {
        setFeedback({
          kind: 'error',
          message: result.message ?? result.error ?? 'Error desconocido',
        })
      }
    })
  }

  const feedbackNode = (
    <>
      {feedback.kind === 'error' && (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700"
        >
          {feedback.message}
        </p>
      )}
      {feedback.kind === 'success' && (
        <p
          role="status"
          className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-700"
        >
          {feedback.message}
        </p>
      )}
    </>
  )

  if (confirming === 'none') {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <BotonSistema
            type="button"
            variante="primario"
            tamaño="sm"
            icono={Check}
            onClick={() => beginConfirm('aprobar')}
          >
            Aprobar
          </BotonSistema>
          <BotonSistema
            type="button"
            variante="outline"
            tamaño="sm"
            icono={X}
            onClick={() => beginConfirm('rechazar')}
            className="border-red-300 text-red-700 hover:bg-red-50"
          >
            Rechazar
          </BotonSistema>
        </div>
        {feedbackNode}
      </div>
    )
  }

  const isAprobar = confirming === 'aprobar'

  return (
    <div className="flex flex-col items-end gap-2">
      <p className="text-xs text-muted-foreground">
        {isAprobar
          ? '¿Aprobar el retiro? Se ejecuta de inmediato.'
          : '¿Rechazar la solicitud? Se cierra sin retirar.'}
      </p>
      <div className="flex items-center gap-2">
        <BotonSistema
          type="button"
          variante="ghost"
          tamaño="sm"
          onClick={cancel}
          disabled={pending}
        >
          Cancelar
        </BotonSistema>
        <BotonSistema
          type="button"
          variante="primario"
          tamaño="sm"
          icono={isAprobar ? Check : X}
          cargando={pending}
          disabled={pending}
          onClick={submit}
          className={
            isAprobar
              ? undefined
              : 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
          }
        >
          {pending
            ? 'Procesando…'
            : isAprobar
              ? 'Confirmar aprobación'
              : 'Confirmar rechazo'}
        </BotonSistema>
      </div>
      {feedbackNode}
    </div>
  )
}
