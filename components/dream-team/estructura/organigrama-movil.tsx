'use client'

/**
 * Estructura — the org chart on phones: a top "Organigrama" button that opens
 * the tree full-screen (the repo's Dialog primitive) with its search and its
 * own close button. Choosing a team closes it and clears the search, which
 * shows the detail of that team again.
 *
 * The side pane and its rail only exist from `lg` up; this button is the
 * other way around (`lg:hidden`).
 */
import { useState, type ReactElement } from 'react'
import { Network, X } from 'lucide-react'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { BotonSistema } from '@/components/ui/sistema-diseno'

import { ArbolNavegable, type ArbolNavegableProps } from './panel-arbol'

export function OrganigramaMovil(arbol: ArbolNavegableProps): ReactElement {
  const [abierto, setAbierto] = useState(false)

  function elegir(equipoId: string): void {
    arbol.onSeleccionar(equipoId)
    arbol.onQueryChange('')
    setAbierto(false)
  }

  return (
    <>
      <BotonSistema
        type="button"
        variante="outline"
        tamaño="sm"
        icono={Network}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        className="self-start lg:hidden"
        onClick={() => setAbierto(true)}
      >
        Organigrama
      </BotonSistema>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          className="left-0 top-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 sm:max-w-none"
        >
          <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
            <DialogTitle className="text-xl font-semibold tracking-tight text-foreground">Organigrama</DialogTitle>
            <BotonSistema
              type="button"
              variante="ghost"
              soloIcono
              icono={X}
              aria-label="Cerrar el organigrama"
              title="Cerrar el organigrama"
              onClick={() => setAbierto(false)}
            />
          </div>
          <ArbolNavegable {...arbol} onSeleccionar={elegir} />
        </DialogContent>
      </Dialog>
    </>
  )
}
