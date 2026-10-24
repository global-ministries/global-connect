'use client'

/**
 * "Cancelar 1 a 1" (odd/tasks/uno-a-uno.md, T4): confirms and sends an
 * optional motivo. Only a scheduled 1:1 can be cancelled.
 */

import { useState, useTransition, type ReactElement } from 'react'
import { CalendarX } from 'lucide-react'

import { BotonSistema, TextareaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cancelarUnoAUno } from '@/app/(auth)/mis-uno-a-uno/actions'
import { LIMITES_UNO_A_UNO } from '@/lib/uno-a-uno/errores'

interface Props {
  readonly unoAUnoId: string
  readonly conQuien: string
}

export function CancelarUnoAUnoDialog({ unoAUnoId, conQuien }: Props): ReactElement {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')

  function abrir(): void {
    setMotivo('')
    setError(null)
    setOpen(true)
  }

  function cerrar(): void {
    setOpen(false)
    setError(null)
  }

  function submit(): void {
    if (pending) return
    setError(null)
    startTransition(async () => {
      const result = await cancelarUnoAUno({ id: unoAUnoId, motivo })
      if (result.ok) setOpen(false)
      else setError(result.message)
    })
  }

  return (
    <>
      <BotonSistema type="button" variante="ghost" tamaño="sm" icono={CalendarX} onClick={abrir}>
        Cancelar 1 a 1
      </BotonSistema>

      <Dialog open={open} onOpenChange={(next) => (next ? abrir() : cerrar())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar 1 a 1</DialogTitle>
            <DialogDescription>{`El 1 a 1 con ${conQuien} queda cancelado.`}</DialogDescription>
          </DialogHeader>

          <TextareaSistema
            label="Motivo (opcional)"
            value={motivo}
            maxLength={LIMITES_UNO_A_UNO.motivo}
            onChange={(e) => setMotivo(e.target.value)}
            filas={2}
          />

          {error ? (
            <TextoSistema role="alert" className="block text-destructive">
              {error}
            </TextoSistema>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <BotonSistema type="button" variante="outline" onClick={cerrar}>
              Volver
            </BotonSistema>
            <BotonSistema type="button" variante="primario" icono={CalendarX} onClick={submit} disabled={pending}>
              {pending ? 'Cancelando…' : 'Sí, cancelar'}
            </BotonSistema>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
