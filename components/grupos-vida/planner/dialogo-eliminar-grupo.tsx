'use client'

/**
 * Planner — confirm deleting a group (S22). Only offered for a group that has
 * not started (puedeEliminarGrupo); the server refuses one that already
 * meets. Its people go back to the bank. Like every board change it waits
 * for "Guardar" (S24) and "Deshacer" takes it back until then. Planning
 * style (S25): the 420px dialog with the 17px title.
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

import { CLASE_DIALOGO, CLASE_TITULO_DIALOGO } from './estilo-planner'

export interface DialogoEliminarGrupoProps {
  readonly grupo: GrupoTablero | null
  readonly onCerrar: () => void
  readonly onConfirmar: (grupo: GrupoTablero) => void
}

export function DialogoEliminarGrupo({ grupo, onCerrar, onConfirmar }: DialogoEliminarGrupoProps): ReactElement {
  const personas = grupo ? personasDelGrupo(grupo).length : 0
  return (
    <AlertDialog open={grupo !== null} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <AlertDialogContent className={CLASE_DIALOGO}>
        <AlertDialogHeader>
          <AlertDialogTitle className={CLASE_TITULO_DIALOGO}>¿Eliminar {grupo?.nombre}?</AlertDialogTitle>
          <AlertDialogDescription>
            {personas > 0 ? `${contar(personas, 'persona vuelve', 'personas vuelven')} al banco. ` : ''}
            Se aplica al guardar; hasta entonces puedes quitarlo con «Deshacer».
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
