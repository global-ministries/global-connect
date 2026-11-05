'use client'

/**
 * Planner — confirm deleting a group (S22). Only offered for a group that has
 * not started (puedeEliminarGrupo); the server refuses one that already
 * meets. Its people go back to the bank and the step can be undone.
 */
import type { ReactElement } from 'react'

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { contar, personasDelGrupo, type GrupoTablero } from '@/lib/platform/grupos-vida/planner'

export interface DialogoEliminarGrupoProps {
  readonly grupo: GrupoTablero | null
  readonly onCerrar: () => void
  readonly onConfirmar: (grupo: GrupoTablero) => void
}

export function DialogoEliminarGrupo({ grupo, onCerrar, onConfirmar }: DialogoEliminarGrupoProps): ReactElement {
  const personas = grupo ? personasDelGrupo(grupo).length : 0
  return (
    <AlertDialog open={grupo !== null} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar {grupo?.nombre}?</AlertDialogTitle>
          <AlertDialogDescription>
            {personas > 0 ? `${contar(personas, 'persona vuelve', 'personas vuelven')} al banco. ` : ''}
            Puedes deshacerlo con «Deshacer».
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={onCerrar}>
            Cancelar
          </BotonSistema>
          <BotonSistema type="button" variante="peligro" tamaño="sm" onClick={() => grupo && onConfirmar(grupo)}>
            Eliminar
          </BotonSistema>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
