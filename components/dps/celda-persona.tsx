'use client'

/**
 * DPS › Programación — the editor of the Productor, Host and Comunicador
 * cells (T11c of odd/tasks/dps-asistencia-pco.md; S11, S7.3): a combobox
 * that fills the cell like the sheet's other editors and, while typing
 * (from 2 characters, after a short pause), lists people of the system
 * found with buscarPersonasProgramacionDps (dps_buscar_personas: planners
 * only; id, name and initials). ↓ / ↑ move over the list (↑ from the first
 * person goes back to the text), Enter or Tab hand the sheet the person
 * picked or none (the written name, saved «Sin cuenta»), a click picks too,
 * Escape cancels. The list is a popover anchored to the cell
 * (`shadow-sheet`, as the planned `PopoverAsignar` of
 * docs/design-system/components.md#planning-style-components), so the
 * sheet's scroll region never clips it; focus never leaves the input. The
 * sheet (hoja-programacion.tsx) decides what Enter, Tab, Escape and leaving
 * the cell do.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'

import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { AvatarIniciales } from '@/components/grupos-vida/planner/avatar-iniciales'
import { buscarPersonasProgramacionDps } from '@/lib/actions/dps-programacion.actions'
import { textoParaBuscar, type PersonaBuscada } from '@/lib/platform/dps/personas'
import { cn } from '@/lib/utils'

/** Typing waits this long before asking (as ConvocarPuesto). */
const ESPERA_BUSQUEDA_MS = 250

export interface CeldaPersonaProps {
  /** "Productor, 15 de noviembre". */
  readonly etiqueta: string
  /** "Productor". */
  readonly columna: string
  readonly valor: string
  /** Enter / F2 selects the text; a typed character keeps the caret at the end. */
  readonly seleccionar: boolean
  readonly condensado: boolean
  readonly onCambio: (valor: string) => void
  /** Enter, Tab and Escape, with the person highlighted (null: the written text). */
  readonly onTecla: (e: KeyboardEvent<HTMLInputElement>, persona: PersonaBuscada | null) => void
  /** A click on a person. */
  readonly onElegir: (persona: PersonaBuscada) => void
  readonly onSalir: () => void
}

type Busqueda =
  | { readonly estado: 'inactiva' }
  | { readonly estado: 'buscando' }
  | { readonly estado: 'lista'; readonly personas: readonly PersonaBuscada[] }
  | { readonly estado: 'error'; readonly mensaje: string }

export function CeldaPersona({ etiqueta, columna, valor, seleccionar, condensado, onCambio, onTecla, onElegir, onSalir }: CeldaPersonaProps): ReactElement {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const pedidoRef = useRef(0)
  const [busqueda, setBusqueda] = useState<Busqueda>({ estado: 'inactiva' })
  const [activo, setActivo] = useState(-1)
  const texto = textoParaBuscar(valor)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    if (seleccionar) el.select()
    else el.setSelectionRange(el.value.length, el.value.length)
    // Only when the editor opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const pedido = ++pedidoRef.current
    setActivo(-1)
    if (texto === null) {
      setBusqueda({ estado: 'inactiva' })
      return
    }
    setBusqueda({ estado: 'buscando' })
    const espera = setTimeout(() => {
      void buscarPersonasProgramacionDps({ texto }).then((r) => {
        if (pedido !== pedidoRef.current) return
        setBusqueda(r.ok ? { estado: 'lista', personas: r.data } : { estado: 'error', mensaje: r.message })
      })
    }, ESPERA_BUSQUEDA_MS)
    return () => clearTimeout(espera)
  }, [texto])

  const personas = busqueda.estado === 'lista' ? busqueda.personas : []
  const elegida = activo >= 0 ? (personas[activo] ?? null) : null
  const abierta = busqueda.estado !== 'inactiva'
  const idLista = `${id}-lista`
  const idOpcion = (i: number) => `${id}-opcion-${i}`

  function tecla(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (personas.length === 0) return
      setActivo((a) => (e.key === 'ArrowDown' ? Math.min(personas.length - 1, a + 1) : Math.max(-1, a - 1)))
      return
    }
    onTecla(e, elegida)
  }

  return (
    <Popover open={abierta}>
      <PopoverAnchor asChild>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={etiqueta}
          aria-autocomplete="list"
          aria-expanded={abierta}
          aria-controls={abierta ? idLista : undefined}
          aria-activedescendant={elegida ? idOpcion(activo) : undefined}
          autoComplete="off"
          spellCheck={false}
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          onKeyDown={tecla}
          onBlur={onSalir}
          className={cn(
            'block w-full border-0 bg-background px-[9px] text-[length:inherit] leading-5 shadow-[inset_0_0_0_3px_color-mix(in_oklab,var(--brand-primary)_20%,transparent)] outline-none',
            condensado ? 'py-[5px]' : 'py-2',
          )}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={2}
        collisionPadding={8}
        // Focus stays in the cell's input: the list is driven from there.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className="w-72 bg-card p-1 shadow-sheet"
      >
        {busqueda.estado === 'error' ? (
          <p role="alert" className="px-2 py-1.5 text-[13px] text-danger-text">
            {busqueda.mensaje}
          </p>
        ) : busqueda.estado === 'buscando' ? (
          <p className="px-2 py-1.5 text-[13px] text-muted-foreground">Buscando…</p>
        ) : personas.length === 0 ? (
          <p className="px-2 py-1.5 text-[13px] text-muted-foreground">Nadie con ese nombre en la plataforma.</p>
        ) : null}
        <ul id={idLista} role="listbox" aria-label={`Personas para ${columna}`} className="max-h-[220px] overflow-y-auto">
          {personas.map((p, i) => (
            <li
              key={p.personaId}
              id={idOpcion(i)}
              role="option"
              aria-selected={i === activo}
              // Keeps the focus in the input, so leaving the cell does not save the text first.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onElegir(p)}
              className={cn(
                'flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[13px] transition-colors hover:bg-accent pointer-coarse:min-h-11',
                i === activo && 'bg-accent',
              )}
            >
              <AvatarIniciales nombres={[p.nombre]} />
              <span className="min-w-0 truncate font-medium">{p.nombre}</span>
            </li>
          ))}
        </ul>
        <p className="border-t border-border/60 px-2 pt-1.5 pb-1 text-xs text-muted-foreground">Enter sin elegir a nadie guarda el texto, sin cuenta.</p>
      </PopoverContent>
    </Popover>
  )
}
