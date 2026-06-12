'use client'

import { useActionState, useEffect } from 'react'

import { useNotificaciones } from '@/hooks/use-notificaciones'

type SupportFormState = { success: boolean; error?: string } | null
type SupportFormAction = (formData: FormData) => Promise<Exclude<SupportFormState, null>>

export function SupportTicketQueueStatusForm({ action, ticketId, ticketNumber, currentStatus, options }: { action: SupportFormAction; ticketId: string; ticketNumber: number; currentStatus: string; options: { valor: string; etiqueta: string }[] }) {
  const toast = useNotificaciones()
  const [state, formAction, isPending] = useActionState(async (_previousState: SupportFormState, formData: FormData) => action(formData), null)

  useEffect(() => {
    if (isPending) toast.info(`Actualizando estado de #${ticketNumber}...`)
  }, [isPending, ticketNumber, toast])

  useEffect(() => {
    if (!state) return
    if (state.success) {
      toast.success(`Estado de #${ticketNumber} actualizado`)
      return
    }
    toast.error(state.error ?? `No se pudo actualizar el estado de #${ticketNumber}`)
  }, [state, ticketNumber, toast])

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      <label className="sr-only" htmlFor={`ticket-${ticketId}-status`}>Nuevo estado para #{ticketNumber}</label>
      <select
        id={`ticket-${ticketId}-status`}
        name="status"
        defaultValue={currentStatus}
        className="h-8 rounded-lg border border-border bg-card/50 px-2 text-xs text-foreground focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
      >
        {options.map((option) => (
          <option key={option.valor} value={option.valor}>{option.etiqueta}</option>
        ))}
      </select>
      <button type="submit" disabled={isPending} className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-50 focus-ring">
        {isPending ? 'Actualizando...' : `Actualizar #${ticketNumber}`}
      </button>
    </form>
  )
}
