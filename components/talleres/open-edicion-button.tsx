'use client'

/**
 * PR36 — Client buttons that transition an existing edicion's state.
 *
 * Two UI surfaces in this file:
 *   - <OpenEdicionButton edicionId={...} />  : borrador → abierto
 *   - <CloseEdicionButton edicionId={...} /> : abierto|en_curso → cerrado
 *
 * Both call the matching server action exported from
 * `app/(auth)/admin/talleres/edicion/[id]/actions.ts`. They share the
 * same useTransition pattern as the legacy OpenEdicionForm (PR23.2a) and
 * render inline loading / error feedback.
 *
 * T4 (odd/tasks/talleres-consolidar-pantallas.md) — moved here from
 * app/(auth)/admin/talleres/edicion/[id]/ so /talleres/[taller]/[edicion]
 * can reuse it too, mirroring how T3 moved OpenEdicionForm: only the
 * client UI moves, the server action stays in the old route folder
 * (still imported by its absolute path) — the old page keeps working
 * unmodified in its data flow, just its import path changes.
 *
 * T10 (odd/tasks/talleres-configuracion-del-taller.md, design audit) — the
 * hand-styled red/emerald/amber tones (`bg-[var(--brand-primary)]`,
 * `border-amber-400`, `bg-red-50`, `bg-emerald-50`) became `BotonSistema`
 * (primario for the positive actions, outline for the trigger/cancel) and
 * `BadgeSistema` (variante="error"/"success") for feedback — never a
 * hardcoded palette class, and dark mode holds because BadgeSistema
 * already carries its own dark-mode tokens.
 */

import {
  useState,
  useTransition,
  type ReactElement,
} from 'react'
import { Lock, RotateCw, Send } from 'lucide-react'

import { BadgeSistema, BotonSistema } from '@/components/ui/sistema-diseno'

import {
  closeExistingEdicionAction,
  openExistingEdicionAction,
} from '@/app/(auth)/admin/talleres/edicion/[id]/actions'

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
      <BotonSistema type="button" variante="primario" tamaño="sm" icono={Send} onClick={submit} disabled={pending}>
        {pending ? 'Abriendo…' : 'Abrir esta edición'}
      </BotonSistema>
      {feedback.kind === 'error' && (
        <BadgeSistema variante="error" role="alert" tamaño="sm">
          {feedback.message}
        </BadgeSistema>
      )}
      {feedback.kind === 'success' && (
        <BadgeSistema variante="success" role="status" tamaño="sm">
          {feedback.message}
        </BadgeSistema>
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
        <BotonSistema
          type="button"
          variante="outline"
          tamaño="sm"
          icono={Lock}
          onClick={() => {
            setFeedback(idleFeedback)
            setConfirming(true)
          }}
        >
          Cerrar esta edición
        </BotonSistema>
        {feedback.kind === 'error' && (
          <BadgeSistema variante="error" role="alert" tamaño="sm">
            {feedback.message}
          </BadgeSistema>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => setConfirming(false)} disabled={pending}>
          Cancelar
        </BotonSistema>
        <BotonSistema type="button" variante="primario" tamaño="sm" icono={RotateCw} onClick={submit} disabled={pending}>
          {pending ? 'Cerrando…' : 'Confirmar cierre'}
        </BotonSistema>
      </div>
      {feedback.kind === 'error' && (
        <BadgeSistema variante="error" role="alert" tamaño="sm">
          {feedback.message}
        </BadgeSistema>
      )}
      {feedback.kind === 'success' && (
        <BadgeSistema variante="success" role="status" tamaño="sm">
          {feedback.message}
        </BadgeSistema>
      )}
    </div>
  )
}
