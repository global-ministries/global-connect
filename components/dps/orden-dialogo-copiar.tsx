'use client'

/**
 * DPS › Plan · Orden — «¿Copiar el orden del domingo 1 de noviembre?» (T13;
 * the same 420px alert dialog as dialogo-copiar.tsx, on `ui/dialog`).
 * dps_orden_copiar copies every row of the previous plan of the same tipo
 * (headers, items, durations, notas, responsables) into this one; when this
 * plan already has an order the copy replaces it, so the dialog says how
 * many rows go and its action reads "Reemplazar". The convocados and the
 * horarios stay untouched. While it copies, it cannot be closed.
 */
import type { ReactElement } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { CLASE_DIALOGO, CLASE_TITULO_DIALOGO } from '@/components/grupos-vida/planner/estilo-planner'
import { fechaHablada, type PlanCabecera } from '@/lib/platform/dps/plan'

export interface OrdenDialogoCopiarProps {
  readonly origen: PlanCabecera | null
  /** Rows of this plan's order. */
  readonly filas: number
  /** The plan has an order (or someone added one meanwhile): the copy replaces it. */
  readonly reemplazar: boolean
  readonly enviando: boolean
  readonly error: string | null
  readonly onCerrar: () => void
  readonly onConfirmar: () => void
}

export function OrdenDialogoCopiar({ origen, filas, reemplazar, enviando, error, onCerrar, onConfirmar }: OrdenDialogoCopiarProps): ReactElement {
  const fecha = origen ? fechaHablada(origen.fecha) : ''
  return (
    <Dialog open={origen !== null} onOpenChange={(a) => !a && !enviando && onCerrar()}>
      <DialogContent role="alertdialog" className={CLASE_DIALOGO} showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className={CLASE_TITULO_DIALOGO}>¿Copiar el orden del {fecha}?</DialogTitle>
          <DialogDescription>
            {reemplazar
              ? filas > 0
                ? `Este plan ya tiene ${filas} ${filas === 1 ? 'fila' : 'filas'} en el orden. Se reemplazan por las del ${fecha}.`
                : `El orden de este plan se reemplaza por el del ${fecha}.`
              : `Se copian los encabezados y elementos del ${fecha}, con sus duraciones y notas.`}{' '}
            Los convocados y los horarios de este plan no cambian.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
        <DialogFooter>
          <BotonSistema type="button" variante="outline" tamaño="sm" disabled={enviando} onClick={onCerrar}>
            Cancelar
          </BotonSistema>
          <BotonSistema type="button" tamaño="sm" variante={reemplazar ? 'peligro' : 'primario'} cargando={enviando} disabled={enviando} onClick={onConfirmar}>
            {reemplazar ? 'Reemplazar' : 'Copiar'}
          </BotonSistema>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
