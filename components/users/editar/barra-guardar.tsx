'use client'

/**
 * The save bar and the discard question of Editar persona (S14 decisions 1
 * and 9; prototype 05-editar-escritorio.html `.barra-g`, `abrirDescartar`).
 * The bar is the selection bar's surface (card, border, `shadow-sheet`) and
 * shows only while there are changes or a save runs. It is sticky at the
 * bottom of the form: above the tab bar on phones, 24px from the bottom from
 * md (docs/design-system/patterns.md#forms).
 */
import { AlertCircle, Loader2 } from 'lucide-react'
import type { ReactElement } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

export interface BarraGuardarProps {
  readonly cambios: number
  /** Errors shown after a save attempt; > 0 turns the status red. */
  readonly errores: number
  readonly guardando: boolean
  readonly onCancelar: () => void
  readonly onGuardar: () => void
}

export function BarraGuardar({ cambios, errores, guardando, onCancelar, onGuardar }: BarraGuardarProps): ReactElement | null {
  if (cambios === 0 && !guardando) return null
  const conError = errores > 0 && !guardando
  return (
    <section
      aria-label="Cambios sin guardar"
      data-slot="barra-guardar"
      className="sticky bottom-[calc(84px+env(safe-area-inset-bottom,0px))] z-30 flex items-center gap-2.5 rounded-2xl border border-border bg-card py-2 pr-2 pl-3.5 text-sm shadow-sheet md:bottom-6 md:py-2.5 md:pr-3 md:pl-[18px]"
    >
      <p role="status" className={cn('flex min-w-0 flex-1 items-center gap-2 text-[13px] text-muted-foreground md:text-sm', conError && 'text-danger-text')}>
        {guardando ? (
          <>
            <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />
            <span>Guardando cambios…</span>
          </>
        ) : conError ? (
          <>
            <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
            <span>{errores === 1 ? 'Revisa 1 campo' : `Revisa ${errores} campos`}</span>
          </>
        ) : (
          <>
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-brand" />
            <span className="truncate">
              <b className="font-mono font-semibold tabular-nums text-foreground">{cambios}</b> {cambios === 1 ? 'cambio' : 'cambios'}
              <span className="max-md:hidden"> sin guardar</span>
            </span>
          </>
        )}
      </p>
      <BotonSistema type="button" variante="outline" tamaño="sm" disabled={guardando} onClick={onCancelar} className="shrink-0">
        Cancelar
      </BotonSistema>
      <BotonSistema type="button" tamaño="sm" cargando={guardando} disabled={guardando} onClick={onGuardar} className="shrink-0">
        {guardando ? 'Guardando…' : (
          <>
            <span className="max-md:hidden">Guardar cambios</span>
            <span className="md:hidden">Guardar</span>
          </>
        )}
      </BotonSistema>
    </section>
  )
}

export interface DialogoDescartarProps {
  readonly abierto: boolean
  readonly cambios: number
  readonly onSeguir: () => void
  readonly onDescartar: () => void
}

export function DialogoDescartar({ abierto, cambios, onSeguir, onDescartar }: DialogoDescartarProps): ReactElement {
  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && onSeguir()}>
      <DialogContent role="alertdialog" className="rounded-2xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>¿Descartar los cambios?</DialogTitle>
          <DialogDescription>
            Tienes {plural(cambios, 'cambio', 'cambios')} sin guardar. Si sales ahora, se pierden.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <BotonSistema type="button" variante="outline" onClick={onSeguir} autoFocus>
            Seguir editando
          </BotonSistema>
          <BotonSistema type="button" variante="peligro" onClick={onDescartar}>
            Descartar
          </BotonSistema>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
