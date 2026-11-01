'use client'

/**
 * Estudiantes › Promover temporada — "¿Promover <campus>?" (artboards 09 / 10
 * `#confirmar`): the alert dialog of `ui/dialog` (as in Usuarios) with the
 * totals, one line per 3er año decision, the new groups, the graduates and
 * the fichas without a group (gap GP3, the summary list), then Cancelar ·
 * Promover temporada. While it applies, it cannot be closed; an error stays
 * inside the dialog.
 */
import type { ReactElement } from 'react'
import { ArrowRight, ArrowUp, GraduationCap, UsersRound } from 'lucide-react'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import type { LineaConfirmacion, ResultadoPromocion } from '@/lib/platform/estudiantes/promocion'

import { ConNumeros } from './partes-promocion'

const ICONOS: Record<LineaConfirmacion['icono'], typeof ArrowUp> = {
  subir: ArrowUp,
  flecha: ArrowRight,
  grupo: UsersRound,
  egresan: GraduationCap,
}

export interface DialogoPromocionProps {
  readonly confirmacion: ResultadoPromocion['confirmacion']
  readonly abierto: boolean
  readonly enviando: boolean
  readonly error: string | null
  readonly onCerrar: () => void
  readonly onConfirmar: () => void
}

export function DialogoPromocion({ confirmacion, abierto, enviando, error, onCerrar, onConfirmar }: DialogoPromocionProps): ReactElement {
  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && !enviando && onCerrar()}>
      <DialogContent role="alertdialog" className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{confirmacion.titulo}</DialogTitle>
          <DialogDescription>{confirmacion.descripcion}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2.5 text-sm text-foreground">
          {confirmacion.lineas.map((linea) => {
            const Icono = ICONOS[linea.icono]
            return (
              <li key={linea.texto} className="flex min-w-0 gap-2.5">
                <Icono aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <ConNumeros texto={linea.texto} />
                </span>
              </li>
            )
          })}
        </ul>
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
        <DialogFooter>
          <BotonSistema type="button" variante="outline" disabled={enviando} onClick={onCerrar}>
            Cancelar
          </BotonSistema>
          <BotonSistema type="button" cargando={enviando} disabled={enviando} onClick={onConfirmar}>
            Promover temporada
          </BotonSistema>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
