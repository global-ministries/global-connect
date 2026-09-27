'use client'

/**
 * PR36 — Client buttons that transition an existing edicion's state.
 *
 *   - <OpenEdicionButton edicionId={...} />  : borrador → abierto.
 *   - <CancelarEdicionButton .../>           : borrador|abierto → cancelado.
 *
 * T10 (odd/tasks/talleres-configuracion-del-taller.md, design audit) — the
 * hand-styled red/emerald/amber tones (`bg-[var(--brand-primary)]`,
 * `border-amber-400`, `bg-red-50`, `bg-emerald-50`) became `BotonSistema`
 * (primario for the positive actions, outline for the trigger/cancel) and
 * `BadgeSistema` (variante="error"/"success") for feedback — never a
 * hardcoded palette class, and dark mode holds because BadgeSistema
 * already carries its own dark-mode tokens.
 *
 * T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) —
 * "Cerrar esta edición" (CloseEdicionButton, abierto|en_curso → cerrado)
 * is GONE: `cerrado`/`en_curso` are now derived from the edición's own
 * dates (talleres_estado_efectivo), never a manual transition — see
 * labels.ts's edicionEstadoLabel/edicionEstadoBadgeVariante. Manual states
 * are only borrador and cancelado (Decisiones): CancelarEdicionButton
 * replaces it, calling the NEW `cancelarEdicion` action (app/(auth)/
 * talleres/[taller]/[edicion]/actions.ts, RLS-direct UPDATE, not the
 * legacy admin RPC-adjacent action file OpenEdicionButton still uses) from
 * a confirm Dialog that warns — but never blocks — when the edición has
 * inscritos. `closeExistingEdicionAction` is removed alongside it (this
 * was its only caller — verified with rg).
 */

import {
  useState,
  useTransition,
  type ReactElement,
} from 'react'
import { Send, XCircle } from 'lucide-react'

import { BadgeSistema, BotonSistema } from '@/components/ui/sistema-diseno'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import { openExistingEdicionAction } from '@/app/(auth)/admin/talleres/edicion/[id]/actions'
import { cancelarEdicion } from '@/app/(auth)/talleres/[taller]/[edicion]/actions'

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

interface CancelarEdicionButtonProps {
  readonly tallerSlug: string
  readonly edicionId: string
  /** Ediciones' own inscripciones_count — warned about in the confirm dialog, never blocking. */
  readonly inscritos: number
}

export function CancelarEdicionButton({
  tallerSlug,
  edicionId,
  inscritos,
}: CancelarEdicionButtonProps): ReactElement {
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<FeedbackState>(idleFeedback)
  const [open, setOpen] = useState(false)

  function confirmar(): void {
    if (pending) return
    setFeedback(idleFeedback)
    startTransition(async () => {
      const result = await cancelarEdicion({ tallerSlug, edicionId })
      if (result.ok) {
        setOpen(false)
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
      <BotonSistema
        type="button"
        variante="outline"
        tamaño="sm"
        icono={XCircle}
        onClick={() => {
          setFeedback(idleFeedback)
          setOpen(true)
        }}
      >
        Cancelar esta edición
      </BotonSistema>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar esta edición</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer.
              {inscritos > 0 &&
                ` Tiene ${inscritos} ${inscritos === 1 ? 'inscrito' : 'inscritos'}.`}
            </DialogDescription>
          </DialogHeader>
          {/* Rendered INSIDE the dialog, not as a sibling of the trigger:
              Radix marks everything outside an open dialog aria-hidden, so
              a sibling alert would be accessibility-invisible exactly while
              it matters most (the confirm is still open, retryable). */}
          {feedback.kind === 'error' && (
            <BadgeSistema variante="error" role="alert" tamaño="sm">
              {feedback.message}
            </BadgeSistema>
          )}
          <div className="flex items-center justify-end gap-2">
            <BotonSistema type="button" variante="outline" onClick={() => setOpen(false)} disabled={pending}>
              Volver
            </BotonSistema>
            <BotonSistema type="button" variante="primario" onClick={confirmar} disabled={pending}>
              {pending ? 'Cancelando…' : 'Confirmar cancelación'}
            </BotonSistema>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
