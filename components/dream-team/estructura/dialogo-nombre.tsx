'use client'

/**
 * Estructura — the one-field dialog behind renaming a team, renaming a rol and
 * naming a new sub-equipo. The submit stays disabled until the name is
 * non-empty and different from the starting value, so nothing invalid or
 * unchanged is ever sent; on success it closes, toasts and lets the caller
 * reload the page data.
 */
import { useState, useTransition, type FormEvent, type ReactElement } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BotonSistema, InputSistema } from '@/components/ui/sistema-diseno'

import { reportarResultado, type ResultadoAccion, type Toast } from './mensajes'

export interface DialogoNombreProps {
  readonly titulo: string
  readonly descripcion: string
  readonly etiquetaCampo: string
  /** What the field starts with; empty when naming something new. */
  readonly valorInicial: string
  readonly textoBoton: string
  /** Toast shown when the action worked. */
  readonly exito: string
  readonly guardar: (label: string) => Promise<ResultadoAccion>
  readonly onClose: () => void
  /** Called once the change went through (after closing). */
  readonly onHecho: () => void
  readonly toast: Toast
}

export function DialogoNombre({
  titulo,
  descripcion,
  etiquetaCampo,
  valorInicial,
  textoBoton,
  exito,
  guardar,
  onClose,
  onHecho,
  toast,
}: DialogoNombreProps): ReactElement {
  const [isPending, startTransition] = useTransition()
  const [nombre, setNombre] = useState(valorInicial)
  const label = nombre.trim()
  const puedeGuardar = label !== '' && label !== valorInicial

  function enviar(event: FormEvent): void {
    event.preventDefault()
    if (!puedeGuardar) return
    startTransition(async () => {
      if (reportarResultado(toast, await guardar(label), exito)) {
        onClose()
        onHecho()
      }
    })
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descripcion}</DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="grid gap-3">
          <InputSistema
            label={etiquetaCampo}
            autoFocus
            value={nombre}
            onChange={(event) => setNombre(event.target.value)}
            disabled={isPending}
          />
          <div className="flex justify-end gap-2">
            <BotonSistema type="button" variante="outline" tamaño="sm" disabled={isPending} onClick={onClose}>
              Cancelar
            </BotonSistema>
            <BotonSistema type="submit" tamaño="sm" disabled={isPending || !puedeGuardar}>
              {textoBoton}
            </BotonSistema>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
