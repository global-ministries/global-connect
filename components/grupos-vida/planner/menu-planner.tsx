'use client'

/**
 * Planner — the popover menus of the planning style (`.menu` of
 * prototipos/planificacion-dps/01): a flat `rounded-md` card with
 * `shadow-sheet` and 36px items (44px on touch). The season switcher and
 * "Más acciones" of the header hang from their button; the options menu of a
 * group column (MenuColumna, the column head's "⋮") is fixed to the viewport,
 * so the lane's horizontal scroll and the card's frame never cut it. They are
 * disclosure popovers (a button with `aria-expanded` and a list of buttons and
 * links): a click outside or Escape closes them, Escape returns the focus to
 * the button.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type RefObject } from 'react'
import { EllipsisVertical, type LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

import { CLASE_BOTON_ICONO } from './estilo-planner'

export const CLASE_MENU = 'absolute top-full z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-card p-1 shadow-sheet'

export const CLASE_ITEM_MENU =
  'focus-ring flex min-h-9 w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-sm font-medium transition-colors hover:bg-accent pointer-coarse:min-h-11'

/** Closes a popover menu on a click outside it or on Escape (focus back to its button). */
export function useCerrarMenu(abierto: boolean, cerrar: () => void, contenedor: RefObject<HTMLElement | null>, boton: RefObject<HTMLButtonElement | null>) {
  useEffect(() => {
    if (!abierto) return
    const alPulsar = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) cerrar()
    }
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      cerrar()
      boton.current?.focus()
    }
    document.addEventListener('mousedown', alPulsar)
    document.addEventListener('keydown', alTeclear)
    return () => {
      document.removeEventListener('mousedown', alPulsar)
      document.removeEventListener('keydown', alTeclear)
    }
  }, [abierto, cerrar, contenedor, boton])
}

const ANCHO_MENU_COLUMNA = 240
const MARGEN = 8

export interface ItemMenu {
  readonly clave: string
  readonly texto: string
  /** Accessible name when the visible text is not enough ("Abrir Mujeres Valientes"). */
  readonly etiqueta?: string
  readonly icono: LucideIcon
  readonly peligro?: boolean
  /** Opens a dialog: the focus goes back to the menu button first, so the dialog returns it there. */
  readonly abreDialogo?: boolean
  readonly onElegir: () => void
}

/**
 * The "⋮" of a group column: `etiqueta` names the button and the list
 * ("Opciones de Mujeres Valientes"); a destructive item comes after a
 * divider, in `danger-text`.
 */
export function MenuColumna({ etiqueta, items }: { readonly etiqueta: string; readonly items: readonly ItemMenu[] }): ReactElement {
  const [abierto, setAbierto] = useState(false)
  const [posicion, setPosicion] = useState<CSSProperties>({})
  const idMenu = useId()
  const contenedor = useRef<HTMLDivElement>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const lista = useRef<HTMLUListElement>(null)
  const cerrarMenu = useMemo(() => () => setAbierto(false), [])
  useCerrarMenu(abierto, cerrarMenu, contenedor, boton)

  // Under the button, right-aligned to it; flips above it near the bottom edge.
  useLayoutEffect(() => {
    if (!abierto || !boton.current) return
    const r = boton.current.getBoundingClientRect()
    const alto = lista.current?.offsetHeight ?? 0
    const left = Math.max(MARGEN, Math.min(r.right - ANCHO_MENU_COLUMNA, window.innerWidth - ANCHO_MENU_COLUMNA - MARGEN))
    const abajo = r.bottom + 4
    const top = abajo + alto > window.innerHeight - MARGEN && r.top - alto - 4 > MARGEN ? r.top - alto - 4 : abajo
    setPosicion({ left, top })
  }, [abierto])

  // A fixed menu would drift from its button: scrolling or resizing closes it.
  useEffect(() => {
    if (!abierto) return
    const cerrar = (e: Event) => {
      if (e.type === 'scroll' && lista.current?.contains(e.target as Node)) return
      setAbierto(false)
    }
    window.addEventListener('scroll', cerrar, true)
    window.addEventListener('resize', cerrar)
    return () => {
      window.removeEventListener('scroll', cerrar, true)
      window.removeEventListener('resize', cerrar)
    }
  }, [abierto])

  const elegir = (item: ItemMenu) => {
    setAbierto(false)
    if (item.abreDialogo) boton.current?.focus()
    item.onElegir()
  }

  return (
    <div ref={contenedor} className="shrink-0">
      <button
        ref={boton}
        type="button"
        aria-label={etiqueta}
        aria-expanded={abierto}
        aria-controls={idMenu}
        title="Opciones"
        onClick={() => setAbierto((a) => !a)}
        className={CLASE_BOTON_ICONO}
      >
        <EllipsisVertical aria-hidden="true" className="size-4" />
      </button>
      <ul
        ref={lista}
        id={idMenu}
        hidden={!abierto}
        aria-label={etiqueta}
        style={{ ...posicion, width: ANCHO_MENU_COLUMNA }}
        className={cn('fixed z-30 max-w-[calc(100vw-1rem)] rounded-md border border-border bg-card p-1 shadow-sheet')}
      >
        {items.map((item, i) => (
          <li key={item.clave}>
            {item.peligro && i > 0 && <hr aria-hidden="true" className="my-1 border-border" />}
            <button
              type="button"
              aria-label={item.etiqueta}
              onClick={() => elegir(item)}
              className={cn(CLASE_ITEM_MENU, item.peligro && 'text-danger-text hover:bg-danger/10')}
            >
              {item.texto}
              <item.icono aria-hidden="true" className={cn('size-4 shrink-0', !item.peligro && 'text-muted-foreground')} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
