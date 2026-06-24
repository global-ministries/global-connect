"use client"

import type React from "react"
import { useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckCircle, ClipboardCheck, XCircle } from "lucide-react"
import { procesarRevisionUbicacionCasa } from "@/lib/actions/casas-anfitrionas.actions"
import { REVIEW_DECISION_NOTES_MAX_LENGTH } from "@/lib/casas-anfitrionas/review-constants"
import { useNotificaciones } from "@/hooks/use-notificaciones"
import { BadgeSistema, BotonSistema, TarjetaSistema, TextareaSistema, TextoSistema, TituloSistema } from "@/components/ui/sistema-diseno"

export type PendingReviewOption = {
  id: string
  casaId: string
  name: string
  type: "create" | "location_change"
  createdAt: string
  requestedBy: string
}

type ReviewDecision = "aprobar" | "rechazar"

const GENERIC_REVIEW_ERROR = "No pudimos procesar la revisión. Actualiza la cola y vuelve a intentarlo."
const NOTES_TOO_LONG_ERROR = `Acorta las notas a ${REVIEW_DECISION_NOTES_MAX_LENGTH} caracteres o menos.`

export function RevisionCasaClient({ reviews }: { reviews: PendingReviewOption[] }) {
  const [items, setItems] = useState(reviews)
  const [notesByReview, setNotesByReview] = useState<Record<string, string>>({})
  const [processingKey, setProcessingKey] = useState("")
  const [formError, setFormError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const submitInFlight = useRef("")
  const router = useRouter()
  const toast = useNotificaciones()

  async function handleDecision(reviewId: string, accion: ReviewDecision) {
    if (submitInFlight.current) return

    if (!items.some((item) => item.id === reviewId)) {
      setSuccessMessage("")
      setFormError(GENERIC_REVIEW_ERROR)
      toast.error(GENERIC_REVIEW_ERROR)
      return
    }

    const notes = normalizeNotes(notesByReview[reviewId])
    if (notes && notes.length > REVIEW_DECISION_NOTES_MAX_LENGTH) {
      setSuccessMessage("")
      setFormError(NOTES_TOO_LONG_ERROR)
      toast.error(NOTES_TOO_LONG_ERROR)
      return
    }

    const key = `${reviewId}:${accion}`
    submitInFlight.current = key
    setProcessingKey(key)
    setFormError("")
    setSuccessMessage("")

    try {
      const result = await procesarRevisionUbicacionCasa({
        reviewId,
        accion,
        notas: notes,
      })

      if (result.success) {
        const message = accion === "aprobar" ? "Revisión aprobada correctamente" : "Revisión rechazada correctamente"
        setItems((current) => current.filter((item) => item.id !== reviewId))
        setNotesByReview((current) => {
          const next = { ...current }
          delete next[reviewId]
          return next
        })
        setSuccessMessage("La decisión quedó registrada en la auditoría.")
        toast.success(message)
        router.refresh()
        return
      }

      const message = toSafeReviewError(result.error)
      setFormError(message)
      toast.error(message)
    } catch {
      setFormError(GENERIC_REVIEW_ERROR)
      toast.error(GENERIC_REVIEW_ERROR)
    } finally {
      submitInFlight.current = ""
      setProcessingKey("")
    }
  }

  return (
    <div className="space-y-5">
      <TarjetaSistema variante="outlined" className="p-4">
        <div className="flex items-start gap-3">
          <ClipboardCheck className="mt-0.5 h-4 w-4 text-orange-500" aria-hidden="true" />
          <TextoSistema variante="sutil" tamaño="sm">
            Cada aprobación o rechazo se ejecuta en el servidor y queda registrado en la auditoría. Rechazar mantiene la última ubicación aprobada sin cambios.
          </TextoSistema>
        </div>
      </TarjetaSistema>

      {formError && (
        <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
          {formError}
        </div>
      )}

      {successMessage && (
        <div role="status" className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
          {successMessage}
        </div>
      )}

      {items.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((review) => {
            const approveKey = `${review.id}:aprobar`
            const rejectKey = `${review.id}:rechazar`
            const isProcessing = Boolean(processingKey)
            return (
              <TarjetaSistema key={review.id} className="p-4 sm:p-5">
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <TituloSistema nivel={3} className="text-base">{review.name}</TituloSistema>
                      <TextoSistema variante="sutil" tamaño="sm">Solicitado por {review.requestedBy}</TextoSistema>
                      <TextoSistema variante="sutil" tamaño="sm">Registrado {formatCreatedAt(review.createdAt)}</TextoSistema>
                    </div>
                    <BadgeSistema variante="warning" tamaño="sm">{reviewTypeLabel(review.type)}</BadgeSistema>
                  </div>

                  <TextareaSistema
                    label={`Notas de revisión para ${review.name}`}
                    filas={2}
                    placeholder="Notas opcionales para la auditoría"
                    maxLength={REVIEW_DECISION_NOTES_MAX_LENGTH}
                    value={notesByReview[review.id] ?? ""}
                    onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => {
                      setNotesByReview((current) => ({ ...current, [review.id]: event.target.value }))
                      setFormError("")
                    }}
                    disabled={isProcessing}
                  />
                  <TextoSistema variante="sutil" tamaño="sm">
                    Máximo {REVIEW_DECISION_NOTES_MAX_LENGTH} caracteres.
                  </TextoSistema>

                  <div className="flex flex-wrap gap-2">
                    <BotonSistema
                      type="button"
                      tamaño="sm"
                      icono={CheckCircle}
                      cargando={processingKey === approveKey}
                      disabled={isProcessing}
                      onClick={() => handleDecision(review.id, "aprobar")}
                    >
                      Aprobar
                    </BotonSistema>
                    <BotonSistema
                      type="button"
                      tamaño="sm"
                      variante="outline"
                      icono={XCircle}
                      cargando={processingKey === rejectKey}
                      disabled={isProcessing}
                      onClick={() => handleDecision(review.id, "rechazar")}
                    >
                      Rechazar
                    </BotonSistema>
                  </div>
                </div>
              </TarjetaSistema>
            )
          })}
        </div>
      ) : (
        <TarjetaSistema className="p-4 sm:p-6">
          <div className="space-y-3">
            <TituloSistema nivel={3}>No hay Casas Anfitrionas pendientes de revisión.</TituloSistema>
            <TextoSistema variante="sutil" tamaño="sm">
              Cuando haya solicitudes nuevas o cambios de ubicación dentro de tu alcance, aparecerán en esta cola.
            </TextoSistema>
            <Link href="/dashboard" className="inline-flex min-h-[44px] items-center text-sm font-medium text-orange-600 hover:underline">
              Volver al dashboard
            </Link>
          </div>
        </TarjetaSistema>
      )}
    </div>
  )
}

function normalizeNotes(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? ""
  return trimmed.length > 0 ? trimmed : null
}

function toSafeReviewError(error: string | undefined): string {
  if (!error) return GENERIC_REVIEW_ERROR
  if (error === "No tienes permisos para realizar esta acción") return error
  if (error === "La revisión solicitada no es válida") return error
  return GENERIC_REVIEW_ERROR
}

function reviewTypeLabel(type: PendingReviewOption["type"]): string {
  return type === "location_change" ? "Cambio de ubicación" : "Solicitud nueva"
}

function formatCreatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "sin fecha registrada"
  return date.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" })
}
