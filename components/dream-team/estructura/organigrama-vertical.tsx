'use client'

/**
 * Estructura — the phone org chart (S12; prototype `.org-v` in
 * prototipos/estructura/08-b-celular.html): the same boxes in one column,
 * each level indented on a connector rail, the campus box on top. A box opens
 * the node panel (a bottom sheet); a box with children has a 44px toggle
 * beside it ("+n" while folded, a chevron that turns when open) with
 * `aria-expanded`. "Expandir todo" and "Contraer todo" sit under the chart.
 */
import type { ReactElement } from 'react'
import { ChevronRight } from 'lucide-react'

import type { CajaOrganigrama } from '@/lib/platform/dream-team/estructura-organigrama'
import { cn } from '@/lib/utils'

import { ContenidoCaja, ContenidoRaiz, claseCaja, descripcionCaja, etiquetaPlegar } from './caja-organigrama'

export interface OrganigramaVerticalProps {
  readonly cajas: readonly CajaOrganigrama[]
  readonly raices: readonly string[]
  readonly raiz: { readonly nombre: string; readonly personas: number }
  readonly onAbrir: (id: string) => void
  readonly onPlegar: (id: string) => void
  readonly onExpandirTodo: () => void
  readonly onContraer: () => void
}

const ENLACE = 'focus-ring min-h-11 rounded-md px-3 text-sm font-medium text-brand-text touch-manipulation'

export function OrganigramaVertical({
  cajas,
  raices,
  raiz,
  onAbrir,
  onPlegar,
  onExpandirTodo,
  onContraer,
}: OrganigramaVerticalProps): ReactElement {
  const porId = new Map(cajas.map((caja) => [caja.id, caja]))

  function rama(ids: readonly string[]): ReactElement {
    return (
      <ul className="ml-4 grid min-w-0 gap-2 border-l-[1.5px] border-border pl-3.5">
        {ids.map((id) => {
          const caja = porId.get(id)
          if (!caja) return null
          return (
            <li
              key={id}
              className={cn(
                'relative grid min-w-0 gap-2',
                "before:absolute before:top-7 before:-left-3.5 before:w-3 before:border-t-[1.5px] before:border-border before:content-['']",
                // The rail stops at the last child's connector.
                "last:after:absolute last:after:top-[29.5px] last:after:bottom-0 last:after:-left-4 last:after:w-[3px] last:after:bg-background last:after:content-['']",
              )}
            >
              <div className="flex min-w-0 items-stretch gap-1.5">
                <button
                  type="button"
                  aria-label={descripcionCaja(caja)}
                  aria-current={caja.seleccionado ? 'true' : undefined}
                  onClick={() => onAbrir(id)}
                  className={cn(claseCaja(caja), 'min-h-14 flex-1 py-2 active:bg-accent')}
                >
                  <ContenidoCaja caja={caja} />
                </button>
                {caja.hijos.length > 0 && (
                  <button
                    type="button"
                    aria-expanded={caja.abierto}
                    aria-label={etiquetaPlegar(caja)}
                    onClick={() => onPlegar(id)}
                    className="focus-ring inline-flex min-w-11 shrink-0 items-center justify-center gap-0.5 rounded-xl px-1.5 text-xs font-semibold text-muted-foreground touch-manipulation active:bg-accent"
                  >
                    {!caja.abierto && <span className="font-mono tabular-nums">+{caja.masN}</span>}
                    {caja.puntoRama && <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />}
                    <ChevronRight
                      aria-hidden="true"
                      className={cn('size-4 transition-transform duration-150 motion-reduce:transition-none', caja.abierto && 'rotate-90')}
                    />
                  </button>
                )}
              </div>
              {caja.abierto && rama(caja.hijos)}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex min-h-14 items-center gap-2.5 rounded-xl border border-brand/40 bg-brand-tint px-3 text-foreground">
        <ContenidoRaiz nombre={raiz.nombre} personas={raiz.personas} />
      </div>
      {rama(raices)}
      <div className="flex justify-center gap-2 pt-2">
        <button type="button" className={ENLACE} onClick={onExpandirTodo}>
          Expandir todo
        </button>
        <button type="button" className={ENLACE} onClick={onContraer}>
          Contraer todo
        </button>
      </div>
    </div>
  )
}
