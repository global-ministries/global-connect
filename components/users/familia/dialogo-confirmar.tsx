'use client'

/**
 * The confirmation of Mi familia (prototype `confirmar()`: Quitar, Cancelar
 * solicitud, No es mi familiar): the same alert dialog as "¿Descartar los
 * cambios?" in Editar persona, with "Volver" first and the action last.
 */
import type { ReactElement } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BotonSistema } from '@/components/ui/sistema-diseno'

export interface ConfirmacionFamilia {
  readonly titulo: string
  readonly texto: string
  readonly accion: string
  readonly alConfirmar: () => Promise<void>
}

export interface DialogoConfirmarProps {
  readonly confirmacion: ConfirmacionFamilia | null
  readonly ocupado: boolean
  readonly onCerrar: () => void
}

export function DialogoConfirmar({ confirmacion, ocupado, onCerrar }: DialogoConfirmarProps): ReactElement {
  return (
    <Dialog open={confirmacion !== null} onOpenChange={(a) => !a && !ocupado && onCerrar()}>
      <DialogContent role="alertdialog" className="rounded-2xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{confirmacion?.titulo}</DialogTitle>
          <DialogDescription>{confirmacion?.texto}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <BotonSistema type="button" variante="outline" onClick={onCerrar} disabled={ocupado}>
            Volver
          </BotonSistema>
          <BotonSistema type="button" variante="peligro" autoFocus cargando={ocupado} onClick={() => void confirmacion?.alConfirmar()}>
            {confirmacion?.accion}
          </BotonSistema>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
