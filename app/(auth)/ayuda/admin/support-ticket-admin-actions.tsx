'use client'

import { useActionState, useEffect } from 'react'

import { BotonSistema, SelectSistema } from '@/components/ui/sistema-diseno'
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
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      <SelectSistema label={`Nuevo estado para #${ticketNumber}`} name="status" defaultValue={currentStatus} opciones={options} />
      <BotonSistema type="submit" tamaño="sm" disabled={isPending}>{isPending ? 'Actualizando...' : `Actualizar estado de #${ticketNumber}`}</BotonSistema>
    </form>
  )
}
