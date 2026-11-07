'use client'

/**
 * Planner — the unsaved changes of the session (S24), opened from "N cambios
 * sin guardar" in the header. A side panel with the counts per kind
 * ("2 movimientos · 1 grupo nuevo"), the changes in the order they will be
 * saved, each with "Quitar" (disabled, with the reason, while a later change
 * depends on it), and Descartar / Guardar in the footer. When a save fails
 * the panel says nothing was saved and marks the change the server pointed
 * at (DETAIL {"indice"}) with its message; every change stays pending.
 *
 * DialogoDescartar confirms throwing the draft away.
 */
import { useId, type ReactElement } from 'react'

import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { resumenCambios, type CambioPendiente } from '@/lib/platform/grupos-vida/planner/borrador'
import { cn } from '@/lib/utils'

import { textoSinGuardar } from './estado-guardado'
import type { ErrorGuardar } from './pasos-planner'

export interface PanelCambiosProps {
  readonly abierto: boolean
  readonly onCerrar: () => void
  readonly cambios: readonly CambioPendiente[]
  readonly error: ErrorGuardar | null
  readonly guardando: boolean
  readonly motivoQuitar: (indice: number) => string | null
  readonly onQuitar: (indice: number) => void
  readonly onDescartar: () => void
  readonly onGuardar: () => void
}

function Fila({
  cambio,
  indice,
  error,
  motivo,
  onQuitar,
}: {
  readonly cambio: CambioPendiente
  readonly indice: number
  readonly error: string | null
  readonly motivo: string | null
  readonly onQuitar: (indice: number) => void
}): ReactElement {
  const idMotivo = useId()
  return (
    <li
      data-error={error ? 'true' : undefined}
      className={cn('flex min-w-0 items-start gap-3 border-b border-border px-2 py-2.5 last:border-b-0', error && 'rounded-xl border-transparent bg-danger/10')}
    >
      <span className={cn('w-6 shrink-0 pt-0.5 text-right font-mono text-xs tabular-nums', error ? 'text-danger-text' : 'text-muted-foreground')}>{indice + 1}</span>
      <div className="min-w-0 flex-1">
        <p data-testid="descripcion" className="break-words text-sm text-foreground">
          {cambio.descripcion}
        </p>
        {error && <p className="break-words text-xs font-medium text-danger-text">{error}</p>}
      </div>
      <BotonSistema
        type="button"
        variante="ghost"
        tamaño="sm"
        aria-label={`Quitar: ${cambio.descripcion}`}
        aria-disabled={motivo !== null}
        aria-describedby={motivo ? idMotivo : undefined}
        title={motivo ?? undefined}
        onClick={() => onQuitar(indice)}
        className="shrink-0"
      >
        Quitar
      </BotonSistema>
      {motivo && (
        <span id={idMotivo} hidden>
          {motivo}
        </span>
      )}
    </li>
  )
}

export function PanelCambios({ abierto, onCerrar, cambios, error, guardando, motivoQuitar, onQuitar, onDescartar, onGuardar }: PanelCambiosProps): ReactElement {
  return (
    <DetalleResponsivo
      abierto={abierto}
      onCambioAbierto={(a) => !a && onCerrar()}
      titulo="Cambios sin guardar"
      descripcion={resumenCambios(cambios)}
      pie={
        <>
          {cambios.length > 0 && (
            <BotonSistema type="button" variante="ghost" tamaño="sm" disabled={guardando} onClick={onDescartar} className="sm:mr-auto">
              Descartar
            </BotonSistema>
          )}
          <BotonSistema type="button" variante="outline" tamaño="sm" onClick={onCerrar}>
            Cerrar
          </BotonSistema>
          <BotonSistema type="button" variante="primario" tamaño="sm" disabled={cambios.length === 0} cargando={guardando} onClick={onGuardar}>
            Guardar
          </BotonSistema>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <AvisoFormulario tono="error" className="py-3">
            No se guardó ningún cambio. {error.indice === null ? error.mensaje : `Revisa el cambio ${error.indice + 1}: quítalo o corrígelo y vuelve a guardar.`}
          </AvisoFormulario>
        )}
        {cambios.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay cambios sin guardar.</p>
        ) : (
          <ol aria-label="Cambios sin guardar">
            {cambios.map((cambio, i) => (
              <Fila
                key={cambio.id}
                cambio={cambio}
                indice={i}
                error={error?.indice === i ? error.mensaje : null}
                motivo={motivoQuitar(i)}
                onQuitar={onQuitar}
              />
            ))}
          </ol>
        )}
        <p className="text-xs text-muted-foreground">
          Al guardar se aplican todos juntos: si uno no se puede, no se guarda ninguno. Cada cambio queda en el historial y se puede deshacer después.
        </p>
      </div>
    </DetalleResponsivo>
  )
}

export function DialogoDescartar({ abierto, cambios, onCerrar, onConfirmar }: { readonly abierto: boolean; readonly cambios: number; readonly onCerrar: () => void; readonly onConfirmar: () => void }): ReactElement {
  return (
    <AlertDialog open={abierto} onOpenChange={(a) => !a && onCerrar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Descartar {textoSinGuardar(cambios)}?</AlertDialogTitle>
          <AlertDialogDescription>El tablero vuelve a lo guardado. Esto no se puede deshacer.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={onCerrar}>
            Cancelar
          </BotonSistema>
          <BotonSistema type="button" variante="peligro" tamaño="sm" onClick={onConfirmar}>
            Descartar
          </BotonSistema>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
