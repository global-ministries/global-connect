'use client'

/**
 * Niños › Eventos — confirmation for archiving an event and removing a
 * horario: `ui/dialog` as an alert dialog, the title as a question, one line
 * that says what stays, Cancelar · the destructive action. While it applies it
 * cannot be closed; an error stays inside.
 */
import type { ReactElement } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BotonSistema } from '@/components/ui/sistema-diseno'

export interface Confirmacion {
  readonly titulo: string
  readonly descripcion: string
  readonly accion: string
}

export function DialogoConfirmar({
  confirmacion,
  enviando,
  error,
  onCerrar,
  onConfirmar,
}: {
  readonly confirmacion: Confirmacion | null
  readonly enviando: boolean
  readonly error: string | null
  readonly onCerrar: () => void
  readonly onConfirmar: () => void
}): ReactElement {
  return (
    <Dialog open={confirmacion !== null} onOpenChange={(a) => !a && !enviando && onCerrar()}>
      <DialogContent role="alertdialog" className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl sm:max-w-[420px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{confirmacion?.titulo}</DialogTitle>
          <DialogDescription>{confirmacion?.descripcion}</DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
        <DialogFooter>
          <BotonSistema type="button" variante="outline" disabled={enviando} onClick={onCerrar}>
            Cancelar
          </BotonSistema>
          <BotonSistema type="button" variante="peligro" cargando={enviando} disabled={enviando} onClick={onConfirmar}>
            {confirmacion?.accion}
          </BotonSistema>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
