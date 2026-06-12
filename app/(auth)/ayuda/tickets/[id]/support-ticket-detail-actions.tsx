'use client'

import { useActionState, useEffect, useRef } from 'react'

import { BotonSistema, SelectSistema, TextareaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { useNotificaciones } from '@/hooks/use-notificaciones'

type SupportFormState = { success: boolean; error?: string } | null
type SupportFormAction = (formData: FormData) => Promise<Exclude<SupportFormState, null>>

export function SupportTicketReplyComposer({ action, isStaffReply }: { action: SupportFormAction; isStaffReply: boolean }) {
  const toast = useNotificaciones()
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction, isPending] = useActionState(async (_previousState: SupportFormState, formData: FormData) => action(formData), null)

  useEffect(() => {
    if (isPending) toast.info(isStaffReply ? 'Enviando respuesta del equipo...' : 'Enviando respuesta...')
  }, [isPending, isStaffReply, toast])

  useEffect(() => {
    if (!state) return
    if (state.success) {
      toast.success(isStaffReply ? 'Respuesta del equipo enviada' : 'Respuesta enviada')
      formRef.current?.reset()
      return
    }
    toast.error(state.error ?? 'No se pudo enviar la respuesta')
  }, [state, isStaffReply, toast])

  return (
    <form ref={formRef} action={formAction} className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{isStaffReply ? 'Responder como soporte' : 'Responder al equipo de soporte'}</p>
        <TextoSistema variante="sutil" tamaño="sm">{isStaffReply ? 'Tu respuesta será visible para el solicitante.' : 'Agrega información o responde al equipo que revisa tu caso.'}</TextoSistema>
      </div>
      <TextareaSistema name="body" label={isStaffReply ? 'Respuesta de soporte' : 'Respuesta al equipo de soporte'} filas={4} required />
      <BotonSistema type="submit" disabled={isPending}>{isPending ? 'Enviando...' : isStaffReply ? 'Enviar respuesta al solicitante' : 'Enviar respuesta'}</BotonSistema>
    </form>
  )
}

export function SupportTicketStatusForm({ action, currentStatus, options }: { action: SupportFormAction; currentStatus: string; options: { valor: string; etiqueta: string }[] }) {
  const toast = useNotificaciones()
  const [state, formAction, isPending] = useActionState(async (_previousState: SupportFormState, formData: FormData) => action(formData), null)

  useEffect(() => {
    if (isPending) toast.info('Actualizando estado del ticket...')
  }, [isPending, toast])

  useEffect(() => {
    if (!state) return
    if (state.success) {
      toast.success('Estado del ticket actualizado')
      return
    }
    toast.error(state.error ?? 'No se pudo actualizar el estado')
  }, [state, toast])

  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
      <SelectSistema label="Nuevo estado" name="status" defaultValue={currentStatus} opciones={options} />
      <BotonSistema type="submit" disabled={isPending}>{isPending ? 'Actualizando...' : 'Actualizar estado'}</BotonSistema>
    </form>
  )
}
