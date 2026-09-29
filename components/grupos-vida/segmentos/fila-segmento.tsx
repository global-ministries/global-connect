'use client'

/**
 * Segmentos — one row of the list (a card on phones): the name, the warning
 * badge when active groups have no stage director, three quiet metrics, and the
 * actions. "Directores" is a link for everyone who sees the row; "Editar" and
 * the icon-only "Más acciones" menu belong to whoever manages segments.
 *
 * The menu holds one destructive item. A segment with anything attached
 * (`bloqueo`) never reaches the delete action: the row shows the reason inline
 * with "Entendido". A segment with nothing attached opens the usual
 * confirmation. The server refuses the delete as well; this only saves the trip.
 */
import { useState, type ReactElement } from 'react'
import Link from 'next/link'
import { MoreHorizontal, Trash2, TriangleAlert } from 'lucide-react'

import GestionSegmentosModales from '@/components/grupos/FormularioSegmento.client'
import { BadgeSistema } from '@/components/ui/sistema-diseno'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { FilaSegmento } from '@/lib/platform/grupos-vida/segmentos-vista'
import { ANILLO } from '../directores/franja-por-ordenar'

export interface FilaSegmentoProps {
  readonly fila: FilaSegmento
  readonly puedeGestionar: boolean
  readonly segmentos: readonly { readonly id: string; readonly nombre: string }[]
}

const BOTON_SECUNDARIO = cn(
  'inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent md:flex-none',
  ANILLO,
)

export function FilaSegmentoLista({ fila, puedeGestionar, segmentos }: FilaSegmentoProps): ReactElement {
  const [avisoAbierto, setAvisoAbierto] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  function pedirEliminar(): void {
    if (fila.bloqueo) setAvisoAbierto(true)
    else setConfirmando(true)
  }

  return (
    <li>
      <article
        aria-label={fila.nombre}
        className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 md:px-[22px] md:py-3.5"
      >
        <div className="flex flex-wrap items-start gap-2 md:flex-nowrap md:items-center md:gap-4">
          <div className="order-1 flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5 md:flex-row md:items-center md:gap-3 md:pt-0">
            <h2 className="text-[17px] font-semibold text-foreground md:text-base">{fila.nombre}</h2>
            {fila.textoSinDirector && (
              <BadgeSistema variante="warning" tamaño="sm" className="order-last gap-1.5 self-start font-bold md:order-none">
                <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                {fila.textoSinDirector}
              </BadgeSistema>
            )}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground md:ml-auto md:flex-nowrap md:gap-x-0 md:text-sm">
              <span className="md:w-[130px]">{fila.textoDirectores}</span>
              <span className="md:w-[140px]">{fila.textoGrupos}</span>
              <span className="md:w-[120px]">{fila.textoPendientes}</span>
            </div>
          </div>

          <div className="order-3 flex basis-full gap-2 md:order-2 md:basis-auto">
            {puedeGestionar && (
              <GestionSegmentosModales
                segmentos={segmentos}
                trigger="editar"
                segmentoEditar={{ id: fila.id, nombre: fila.nombre }}
                claseBoton={cn('flex-1 md:flex-none')}
              />
            )}
            <Link href={`/grupos-vida/segmentos/${fila.id}/directores`} className={BOTON_SECUNDARIO}>
              Directores
            </Link>
          </div>

          {puedeGestionar && (
            <>
              {/* modal={false}: the confirmation opens from an item, and a modal menu would fight it for focus. */}
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Más acciones de ${fila.nombre}`}
                    className={cn(
                      'order-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:order-3',
                      ANILLO,
                    )}
                  >
                    <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-56">
                  <DropdownMenuItem variant="destructive" className="min-h-11 px-3 text-sm font-semibold" onSelect={pedirEliminar}>
                    <Trash2 aria-hidden="true" />
                    Eliminar segmento
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <GestionSegmentosModales
                segmentos={segmentos}
                trigger="eliminar"
                segmentoEditar={{ id: fila.id, nombre: fila.nombre }}
                abierto={confirmando}
                onCerrar={() => setConfirmando(false)}
              />
            </>
          )}
        </div>

        {avisoAbierto && fila.bloqueo && (
          <div
            role="status"
            className="flex flex-col gap-2.5 rounded-xl border border-border bg-background p-3 md:flex-row md:items-center md:gap-3 md:px-3.5"
          >
            <div className="flex flex-1 items-start gap-2.5 md:items-center">
              <TriangleAlert className="mt-px h-[18px] w-[18px] shrink-0 text-yellow-600 dark:text-yellow-400" aria-hidden="true" />
              <p className="text-sm text-foreground">{fila.bloqueo}</p>
            </div>
            <button
              type="button"
              onClick={() => setAvisoAbierto(false)}
              className={cn(BOTON_SECUNDARIO, 'flex-none')}
            >
              Entendido
            </button>
          </div>
        )}
      </article>
    </li>
  )
}
