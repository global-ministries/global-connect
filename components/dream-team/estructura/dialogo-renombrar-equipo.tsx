'use client'

/**
 * Estructura — rename a team: a small dialog with one field. The submit stays
 * disabled until the name is non-empty and different from the current one, so
 * nothing invalid is ever sent.
 */
import { useState, useTransition, type FormEvent, type ReactElement } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BotonSistema, InputSistema } from '@/components/ui/sistema-diseno'
import { renombrarEquipo } from '@/app/(auth)/admin/dream-team/estructura/actions'

import { reportarResultado, type Toast } from './mensajes'

export interface DialogoRenombrarEquipoProps {
  readonly equipo: { readonly id: string; readonly label: string }
  readonly onClose: () => void
  readonly onRenombrado: () => void
  readonly toast: Toast
}

export function DialogoRenombrarEquipo({ equipo, onClose, onRenombrado, toast }: DialogoRenombrarEquipoProps): ReactElement {
  const [isPending, startTransition] = useTransition()
  const [nombre, setNombre] = useState(equipo.label)
  const label = nombre.trim()
  const puedeGuardar = label !== '' && label !== equipo.label

  function guardar(event: FormEvent): void {
    event.preventDefault()
    if (!puedeGuardar) return
    startTransition(async () => {
      const resultado = await renombrarEquipo({ id: equipo.id, label })
      if (reportarResultado(toast, resultado, 'Equipo renombrado correctamente.')) {
        onClose()
        onRenombrado()
      }
    })
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renombrar equipo</DialogTitle>
          <DialogDescription>El nuevo nombre se verá en todas las pantallas de Dream Team.</DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="grid gap-3">
          <InputSistema
            label="Nombre del equipo"
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
              Guardar
            </BotonSistema>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
