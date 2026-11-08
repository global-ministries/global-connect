'use client'

/**
 * DPS › Plan — "¿Copiar del domingo 1 de noviembre?" (the `dialog#cf` of
 * prototipos/planificacion-dps/01): the 420px alert dialog of the planning
 * style on `ui/dialog`. dps_copiar_plan copies the convocados of the
 * previous plan of the same tipo into this one; when this plan already has
 * convocados it can only replace them, so the dialog says how many and its
 * action reads "Reemplazar". If someone convocó meanwhile, the RPC answers
 * 'destino_con_convocados' and the parent switches the dialog to replace,
 * with the reason inside. While it copies, it cannot be closed.
 */
import type { ReactElement } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { CLASE_DIALOGO, CLASE_TITULO_DIALOGO } from '@/components/grupos-vida/planner/estilo-planner'
import { fechaHablada, type PlanCabecera } from '@/lib/platform/dps/plan'

export interface DialogoCopiarProps {
  readonly origen: PlanCabecera | null
  /** Distinct people convocados by hand (the automatic directors stay); > 0 means the copy replaces them. */
  readonly convocados: number
  readonly reemplazar: boolean
  readonly enviando: boolean
  readonly error: string | null
  readonly onCerrar: () => void
  readonly onConfirmar: () => void
}

export function DialogoCopiar({ origen, convocados, reemplazar, enviando, error, onCerrar, onConfirmar }: DialogoCopiarProps): ReactElement {
  const fecha = origen ? fechaHablada(origen.fecha) : ''
  return (
    <Dialog open={origen !== null} onOpenChange={(a) => !a && !enviando && onCerrar()}>
      <DialogContent role="alertdialog" className={CLASE_DIALOGO} showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className={CLASE_TITULO_DIALOGO}>¿Copiar del {fecha}?</DialogTitle>
          <DialogDescription>
            {reemplazar
              ? `${convocados > 0 ? `Este plan ya tiene ${convocados} ${convocados === 1 ? 'convocado' : 'convocados'}. ` : ''}Se quitan y se convocan los del ${fecha}, en los mismos puestos.`
              : `Se convocan las mismas personas del ${fecha} en los mismos puestos.`}{' '}
            Quien ya no sirve o cuyo puesto se desactivó no se copia.
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
