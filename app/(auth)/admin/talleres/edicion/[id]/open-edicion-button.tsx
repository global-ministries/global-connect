'use client'

/**
 * PR36 — Client buttons that transition an existing edicion's state.
 *
 * Two UI surfaces in this file:
 *   - <OpenEdicionButton edicionId={...} />  : borrador → abierto
 *   - <CloseEdicionButton edicionId={...} /> : abierto|en_curso → cerrado
 *
 * Both call the matching server action exported from
 * `./actions.ts`. They share the same useTransition pattern as the
 * legacy OpenEdicionForm (PR23.2a) and render inline loading /
 * error feedback.
 *
 * Visual style: same primary / danger tones as the rest of the
 * admin /talleres/* surfaces, rendered inline next to the badge.
 */

import {
  useState,
  useTransition,
  type ReactElement,
} from 'react'
import { Lock, RotateCw, Send } from 'lucide-react'

import {
  closeExistingEdicionAction,
  openExistingEdicionAction,
} from './actions'

interface BaseProps {
  readonly edicionId: string
}

type FeedbackState = {
  readonly kind: 'idle' | 'error' | 'success'
  readonly message?: string
}

const idleFeedback: FeedbackState = { kind: 'idle' }

export function OpenEdicionButton({ edicionId }: BaseProps): ReactElement {
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<FeedbackState>(idleFeedback)

  function submit(): void {
    if (pending) return
    setFeedback(idleFeedback)
    startTransition(async () => {
      const result = await openExistingEdicionAction(edicionId)
      if (result.ok) {
        // The server action revalidates the page; the badge +
        // counts will refresh on the next render. No client-side
        // router.refresh needed — Next.js Server Actions handle it.
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
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        <Send className="h-4 w-4" />
        {pending ? 'Abriendo…' : 'Abrir esta edición'}
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

export function CloseEdicionButton({ edicionId }: BaseProps): ReactElement {
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<FeedbackState>(idleFeedback)
  const [confirming, setConfirming] = useState(false)

  function submit(): void {
    if (pending) return
    setFeedback(idleFeedback)
    startTransition(async () => {
      const result = await closeExistingEdicionAction(edicionId)
      if (result.ok) {
        setFeedback({ kind: 'success', message: result.message })
        setConfirming(false)
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
      <div className="flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => {
            setFeedback(idleFeedback)
            setConfirming(true)
          }}
          className="inline-flex items-center gap-2 rounded border border-amber-400 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50"
        >
          <Lock className="h-4 w-4" /> Cerrar esta edición
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
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="rounded border px-3 py-2 text-sm disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded bg-amber-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <RotateCw className="h-4 w-4" />
          {pending ? 'Cerrando…' : 'Confirmar cierre'}
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
