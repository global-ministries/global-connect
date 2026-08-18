'use client'

/**
 * PR42 — Client buttons for the `/admin/talleres/inscripciones` rows.
 *
 * Two UI surfaces:
 *   - <ApproveInscripcionButton inscripcionId={...} />: pendiente → aprobado.
 *   - <RejectInscripcionButton inscripcionId={...} />: pendiente → no_aprobado.
 *     The motivo (required by the trigger) is captured inline via a
 *     small form; the action returns INVALID_MOTIVO when the user
 *     submits an empty string.
 *
 * Both buttons share the `useTransition` pattern from the
 * `open-edicion-button.tsx` (PR36) sibling. The action layer
 * (./actions.ts) revalidates the page so the row + counts refresh
 * without a client-side router.refresh().
 */

import {
  useState,
  useTransition,
  type ReactElement,
} from 'react'
import { Check, X } from 'lucide-react'

import {
  approveInscripcionAction,
  rejectInscripcionAction,
} from './actions'

interface BaseProps {
  readonly inscripcionId: string
}

type FeedbackState = {
  readonly kind: 'idle' | 'error' | 'success'
  readonly message?: string
}

const idleFeedback: FeedbackState = { kind: 'idle' }

export function ApproveInscripcionButton({ inscripcionId }: BaseProps): ReactElement {
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<FeedbackState>(idleFeedback)

  function submit(): void {
    if (pending) return
    setFeedback(idleFeedback)
    startTransition(async () => {
      const result = await approveInscripcionAction(inscripcionId)
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
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        aria-label="Aprobar inscripci\u00f3n"
        className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" />
        {pending ? 'Aprobando…' : 'Aprobar'}
      </button>
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

export function RejectInscripcionButton({ inscripcionId }: BaseProps): ReactElement {
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<FeedbackState>(idleFeedback)
  const [confirming, setConfirming] = useState(false)
  const [motivo, setMotivo] = useState('')

  function submit(): void {
    if (pending) return
    setFeedback(idleFeedback)
    startTransition(async () => {
      const result = await rejectInscripcionAction(inscripcionId, motivo)
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
        <button
          type="button"
          onClick={() => {
            setFeedback(idleFeedback)
            setConfirming(true)
          }}
          aria-label="Rechazar inscripci\u00f3n"
          className="inline-flex items-center gap-1 rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
        >
          <X className="h-3.5 w-3.5" />
          Rechazar
        </button>
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
        <button
          type="button"
          onClick={() => {
            setConfirming(false)
            setMotivo('')
            setFeedback(idleFeedback)
          }}
          disabled={pending}
          className="rounded border px-2 py-1 text-xs disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending || motivo.trim().length === 0}
          className="inline-flex items-center gap-1 rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
          {pending ? 'Rechazando…' : 'Confirmar rechazo'}
        </button>
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
