'use client'

/**
 * Client buttons for the shared `<TablaInscripciones>` rows.
 *
 * Two UI surfaces:
 *   - <ApproveInscripcionButton inscripcionId onApprove ... />: pendiente → approved.
 *   - <RejectInscripcionButton inscripcionId onReject ... />: pendiente → no_aprobado.
 *     The motivo (required by the trigger) is captured inline via a
 *     small form; the action returns INVALID_MOTIVO when the user
 *     submits an empty string. L24 (odd/tasks/talleres-reserva-publica.md):
 *     two fields — the internal motivo («Solo lo ve el equipo») and an
 *     optional message for the person, the only text the «No aprobada»
 *     notice carries.
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
  useId,
  useState,
  useTransition,
  type ReactElement,
} from 'react'
import { Check, X } from 'lucide-react'

import { BotonSistema, TextareaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

import type {
  InscripcionActionResult,
} from '@/lib/platform/talleres/inscripciones-actions'

export type InscripcionApproveAction = (
  inscripcionId: string,
) => Promise<InscripcionActionResult>

export type InscripcionRejectAction = (
  inscripcionId: string,
  motivo: string,
  mensaje?: string,
) => Promise<InscripcionActionResult>

/** taller_inscripciones.mensaje_no_aprobado's CHECK. */
const MENSAJE_MAX = 600

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
          className="rounded-xl border border-danger/30 bg-danger/10 px-2 py-1 text-xs text-danger-text"
        >
          {feedback.message}
        </p>
      )}
      {feedback.kind === 'success' && (
        <p
          role="status"
          className="rounded-xl border border-success/30 bg-success/10 px-2 py-1 text-xs text-success-text"
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
  const [mensaje, setMensaje] = useState('')
  const idCampos = useId()
  const idAyudaMotivo = `${idCampos}-motivo-ayuda`
  const idAyudaMensaje = `${idCampos}-mensaje-ayuda`

  function submit(): void {
    if (pending) return
    setFeedback(idleFeedback)
    startTransition(async () => {
      const result = await onReject(inscripcionId, motivo, mensaje)
      if (result.ok) {
        setFeedback({ kind: 'success', message: result.message })
        setConfirming(false)
        setMotivo('')
        setMensaje('')
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
          className="border-danger/40 text-danger-text hover:bg-danger/10 focus:ring-danger"
        >
          Rechazar
        </BotonSistema>
        {feedback.kind === 'error' && (
          <p
            role="alert"
            className="rounded-xl border border-danger/30 bg-danger/10 px-2 py-1 text-xs text-danger-text"
          >
            {feedback.message}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="w-full max-w-72 space-y-1 text-left">
        <TextareaSistema
          label="Motivo interno (obligatorio)"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          filas={2}
          required
          aria-describedby={idAyudaMotivo}
          disabled={pending}
        />
        <TextoSistema id={idAyudaMotivo} variante="sutil" tamaño="sm" className="block">
          Solo lo ve el equipo
        </TextoSistema>
      </div>
      <div className="w-full max-w-72 space-y-1 text-left">
        <TextareaSistema
          label="Mensaje para la persona (opcional)"
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          filas={2}
          maxLength={MENSAJE_MAX}
          aria-describedby={idAyudaMensaje}
          disabled={pending}
        />
        <TextoSistema id={idAyudaMensaje} variante="sutil" tamaño="sm" className="block">
          Le llega a la persona y a su pareja por correo y en la app
        </TextoSistema>
      </div>
      <div className="flex items-center gap-2">
        <BotonSistema
          type="button"
          variante="ghost"
          tamaño="sm"
          onClick={() => {
            setConfirming(false)
            setMotivo('')
            setMensaje('')
            setFeedback(idleFeedback)
          }}
          disabled={pending}
        >
          Cancelar
        </BotonSistema>
        <BotonSistema
          type="button"
          variante="peligro"
          tamaño="sm"
          icono={X}
          cargando={pending}
          disabled={pending || motivo.trim().length === 0}
          onClick={submit}
        >
          {pending ? 'Rechazando…' : 'Confirmar rechazo'}
        </BotonSistema>
      </div>
      {feedback.kind === 'error' && (
        <p
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger/10 px-2 py-1 text-xs text-danger-text"
        >
          {feedback.message}
        </p>
      )}
      {feedback.kind === 'success' && (
        <p
          role="status"
          className="rounded-xl border border-success/30 bg-success/10 px-2 py-1 text-xs text-success-text"
        >
          {feedback.message}
        </p>
      )}
    </div>
  )
}