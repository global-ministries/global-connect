'use client'

/**
 * Client buttons for the shared `<TablaInscripciones>` rows.
 *
 * Two UI surfaces:
 *   - <ApproveInscripcionButton inscripcionId onApprove ... />: pendiente → approved.
 *   - <RejectInscripcionButton inscripcionId onReject ... />: pendiente → no_aprobado.
 *     The motivo (required by the trigger) is captured inline via a
 *     small form; the action returns INVALID_MOTIVO when the user
 *     submits an empty string.
 *
 * Server actions (`onApprove`, `onReject`) are passed as props so the
 * buttons are page-agnostic — the global admin page and the
 * coordination page both wire their own actions (currently the same
 * shared `approveInscripcionAction` / `rejectInscripcionAction`
 * exported from `@/lib/platform/talleres/inscripciones-actions`,
 * but the indirection lets each page add telemetry / extra
 * authorization later without touching the buttons).
 *
 * Pattern (PR36 sibling): both buttons use the `useTransition` hook
 * so the disabled/loading state mirrors the action's progress. The
 * action layer revalidates the page so the row + counts refresh
 * without a client-side router.refresh().
 */

import {
  useState,
  useTransition,
  type ReactElement,
} from 'react'
import { Check, X } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'

import type {
  InscripcionActionResult,
} from '@/lib/platform/talleres/inscripciones-actions'

export type InscripcionApproveAction = (
  inscripcionId: string,
) => Promise<InscripcionActionResult>

export type InscripcionRejectAction = (
  inscripcionId: string,
  motivo: string,
) => Promise<InscripcionActionResult>

interface ApproveProps {
  readonly inscripcionId: string
  readonly onApprove: InscripcionApproveAction
}

interface RejectProps {
  readonly inscripcionId: string
  readonly onReject: InscripcionRejectAction
}

type FeedbackState = {
  readonly kind: 'idle' | 'error' | 'success'
  readonly message?: string
}

const idleFeedback: FeedbackState = { kind: 'idle' }

export function ApproveInscripcionButton({
  inscripcionId,
  onApprove,
}: ApproveProps): ReactElement {
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<FeedbackState>(idleFeedback)

  function submit(): void {
    if (pending) return
    setFeedback(idleFeedback)
    startTransition(async () => {
      const result = await onApprove(inscripcionId)
      if (result.ok) {
        setFeedback({ kind: 'success', message: result.message })
      } else {
        setFeedback({
          kind: 'error',
          message: result.message ?? result.error ?? 'Error desconocido',
        })
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <BotonSistema
        type="button"
        variante="primario"
        tamaño="sm"
        icono={Check}
        cargando={pending}
        onClick={submit}
        aria-label="Aprobar inscripci\u00f3n"
      >
        {pending ? 'Aprobando…' : 'Aprobar'}
      </BotonSistema>
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
    </div>
  )
}

export function RejectInscripcionButton({
  inscripcionId,
  onReject,
}: RejectProps): ReactElement {
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<FeedbackState>(idleFeedback)
  const [confirming, setConfirming] = useState(false)
  const [motivo, setMotivo] = useState('')

  function submit(): void {
    if (pending) return
    setFeedback(idleFeedback)
    startTransition(async () => {
      const result = await onReject(inscripcionId, motivo)
      if (result.ok) {
        setFeedback({ kind: 'success', message: result.message })
        setConfirming(false)
        setMotivo('')
      } else {
        setFeedback({
          kind: 'error',
          message: result.message ?? result.error ?? 'Error desconocido',
        })
      }
    })
  }

  if (!confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <BotonSistema
          type="button"
          variante="outline"
          tamaño="sm"
          icono={X}
          onClick={() => {
            setFeedback(idleFeedback)
            setConfirming(true)
          }}
          aria-label="Rechazar inscripci\u00f3n"
          className="border-red-300 text-red-700 hover:bg-red-50"
        >
          Rechazar
        </BotonSistema>
        {feedback.kind === 'error' && (
          <p
            role="alert"
            className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700"
          >
            {feedback.message}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <textarea
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo de rechazo (obligatorio)"
        rows={2}
        className="w-72 rounded border border-input bg-background px-2 py-1 text-xs"
        aria-label="Motivo de rechazo"
        disabled={pending}
      />
      <div className="flex items-center gap-2">
        <BotonSistema
          type="button"
          variante="ghost"
          tamaño="sm"
          onClick={() => {
            setConfirming(false)
            setMotivo('')
            setFeedback(idleFeedback)
          }}
          disabled={pending}
        >
          Cancelar
        </BotonSistema>
        <BotonSistema
          type="button"
          variante="primario"
          tamaño="sm"
          icono={X}
          cargando={pending}
          disabled={pending || motivo.trim().length === 0}
          onClick={submit}
          className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
        >
          {pending ? 'Rechazando…' : 'Confirmar rechazo'}
        </BotonSistema>
      </div>
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
    </div>
  )
}