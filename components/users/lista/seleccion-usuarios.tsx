'use client'

/**
 * Usuarios — the bulk role change of the "Seleccionar" mode (S13 decision 3;
 * prototype 01-lista-escritorio.html, `renderSeleccion`): a bar fixed at the
 * bottom (above the tab bar on phones) with the count, "Toda la página",
 * the new role, "Cambiar rol" and "Cancelar", and a confirmation dialog
 * before /api/usuarios/cambiar-rol (which checks admin again).
 */
import { useState, type ReactElement } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BotonSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { ETIQUETA_ROL, ROLES_SISTEMA } from '@/lib/platform/usuarios/lista-vista'

const OPCIONES_ROL = ROLES_SISTEMA.map((rol) => ({ valor: rol, etiqueta: ETIQUETA_ROL[rol] })).reverse()

const personas = (n: number) => `${n.toLocaleString('es-VE')} ${n === 1 ? 'persona' : 'personas'}`

export interface SeleccionUsuariosProps {
  readonly cantidad: number
  /** Every row of the page is marked. */
  readonly paginaCompleta: boolean
  readonly onAlternarPagina: () => void
  readonly onCancelar: () => void
  /** Runs the change; resolves when it is done (the dialog closes) or throws (the dialog shows the error). */
  readonly onCambiarRol: (rol: string) => Promise<void>
}

export function SeleccionUsuarios({ cantidad, paginaCompleta, onAlternarPagina, onCancelar, onCambiarRol }: SeleccionUsuariosProps): ReactElement {
  const [rol, setRol] = useState<string>('miembro')
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirmar(): Promise<void> {
    setEnviando(true)
    setError(null)
    try {
      await onCambiarRol(rol)
      setConfirmando(false)
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo cambiar el rol.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <section
        aria-label="Personas seleccionadas"
        className="fixed inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom,0px))] z-40 flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-2xl border border-border bg-card px-3 py-2.5 text-sm shadow-sheet md:inset-x-auto md:right-6 md:bottom-6 md:w-[min(46rem,calc(100%-3rem))] lg:right-12"
      >
        <p aria-live="polite" className="mr-auto font-semibold text-foreground">
          <span className="font-mono tabular-nums">{cantidad.toLocaleString('es-VE')}</span> {cantidad === 1 ? 'seleccionada' : 'seleccionadas'}
        </p>
        <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={onAlternarPagina}>
          {paginaCompleta ? 'Quitar la página' : 'Toda la página'}
        </BotonSistema>
        <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={onCancelar} className="max-md:order-1">
          Cancelar
        </BotonSistema>
        <div className="min-w-0 flex-[1_1_140px] max-md:order-2 md:max-w-60">
          <SelectSistema aria-label="Nuevo rol" opciones={OPCIONES_ROL} value={rol} onValueChange={setRol} />
        </div>
        <BotonSistema type="button" tamaño="sm" disabled={cantidad === 0} onClick={() => setConfirmando(true)} className="max-md:order-3">
          Cambiar rol
        </BotonSistema>
      </section>

      <Dialog open={confirmando} onOpenChange={(abierto) => !enviando && setConfirmando(abierto)}>
        <DialogContent role="alertdialog" className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Cambiar rol</DialogTitle>
            <DialogDescription>
              {`¿Cambiar el rol de ${personas(cantidad)} a «${ETIQUETA_ROL[rol]}»? Cambia lo que pueden ver y editar.`}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          )}
          <DialogFooter>
            <BotonSistema type="button" variante="outline" disabled={enviando} onClick={() => setConfirmando(false)}>
              Cancelar
            </BotonSistema>
            <BotonSistema type="button" cargando={enviando} disabled={enviando} onClick={confirmar}>
              Cambiar rol
            </BotonSistema>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
