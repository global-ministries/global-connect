'use client'

/**
 * DPS › Programación — the editor of the Productor, Host, Comunicador and
 * Cantantes cells (T11c, T14b of odd/tasks/dps-asistencia-pco.md; S11,
 * S12.3, S12.4, S7.3). A cell holds several people (up to 3; 8 in
 * Cantantes): the ones already there are chips (`bg-muted`, as the name
 * chips of the matrix) and a combobox after them suggests only the people
 * of the column's list (lib/platform/dps/listas.ts, loaded with the page),
 * filtered as you type, without the ones already in the cell. ↓ / ↑ move
 * over the list (↑ from the first person goes back to the text), a click
 * adds the person and keeps editing, Backspace on an empty input or a
 * chip's × takes someone out; Enter and Tab hand the sheet the person
 * highlighted or none (a typed name is then saved «Sin cuenta»), Escape
 * cancels. The list is a popover anchored to the cell (`shadow-sheet`, as
 * the planned `PopoverAsignar` of
 * docs/design-system/components.md#planning-style-components), so the
 * sheet's scroll region never clips it; focus never leaves the input. The
 * sheet (hoja-programacion.tsx) holds the edit and decides what Enter, Tab,
 * Escape and leaving the cell do.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { UserRound, X } from 'lucide-react'

import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { AvatarIniciales } from '@/components/grupos-vida/planner/avatar-iniciales'
import { filtrarPersonas, type PersonaBuscada } from '@/lib/platform/dps/personas'
import type { EntradaPersona } from '@/lib/platform/dps/programacion'
import { cn } from '@/lib/utils'

export interface CeldaPersonaProps {
  /** "Productor, 15 de noviembre". */
  readonly etiqueta: string
  /** "Productor". */
  readonly columna: string
  /** "Productores": the list the suggestions come from. */
  readonly nombreLista: string
  /** The people in the cell now. */
  readonly entradas: readonly EntradaPersona[]
  /** The text being typed. */
  readonly valor: string
  /** The cell's limit (3; 8 in Cantantes). */
  readonly maximo: number
  /** The column's list. */
  readonly sugeridas: readonly PersonaBuscada[]
  readonly condensado: boolean
  readonly onCambio: (valor: string) => void
  /** A click on a person: added, the edit goes on. */
  readonly onAgregar: (persona: PersonaBuscada) => void
  readonly onQuitar: (indice: number) => void
  /** Enter, Tab and Escape, with the person highlighted (null: the typed text). */
  readonly onTecla: (e: KeyboardEvent<HTMLInputElement>, persona: PersonaBuscada | null) => void
  readonly onSalir: () => void
}

export function CeldaPersona({
  etiqueta,
  columna,
  nombreLista,
  entradas,
  valor,
  maximo,
  sugeridas,
  condensado,
  onCambio,
  onAgregar,
  onQuitar,
  onTecla,
  onSalir,
}: CeldaPersonaProps): ReactElement {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  // The highlight belongs to one text and one set of chips: a change starts the list again.
  const clave = `${valor}|${entradas.length}`
  const [resaltado, setResaltado] = useState({ clave, indice: -1 })
  const activo = resaltado.clave === clave ? resaltado.indice : -1
  const lleno = entradas.length >= maximo
  const yaEstan = entradas.flatMap((e) => (e.personaId ? [e.personaId] : []))
  const personas = lleno ? [] : filtrarPersonas(sugeridas, valor, yaEstan)
  const elegida = activo >= 0 ? (personas[activo] ?? null) : null
  const idLista = `${id}-lista`
  const idOpcion = (i: number) => `${id}-opcion-${i}`

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
    // Only when the editor opens.
  }, [])

  function tecla(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (personas.length === 0) return
      const indice = e.key === 'ArrowDown' ? Math.min(personas.length - 1, activo + 1) : Math.max(-1, activo - 1)
      setResaltado({ clave, indice })
      return
    }
    if (e.key === 'Backspace' && valor === '' && entradas.length > 0) {
      e.preventDefault()
      onQuitar(entradas.length - 1)
      return
    }
    onTecla(e, elegida)
  }

  const aviso = lleno
    ? `Máximo ${maximo} personas en ${columna}. Quita a alguien para agregar a otra.`
    : personas.length > 0
      ? null
      : sugeridas.length === 0
        ? `Nadie en la lista de ${nombreLista} todavía. Escribe el nombre para guardarlo sin cuenta.`
        : valor.trim() === ''
          ? `Nadie más de la lista de ${nombreLista}.`
          : 'Nadie de la lista con ese nombre. Enter lo guarda sin cuenta.'

  return (
    <Popover open>
      <PopoverAnchor asChild>
        <div
          className={cn(
            'flex w-full flex-wrap items-center gap-1 bg-background px-[9px] shadow-[inset_0_0_0_3px_color-mix(in_oklab,var(--brand-primary)_20%,transparent)]',
            condensado ? 'py-[3px]' : 'py-1.5',
          )}
        >
          {entradas.map((e, i) => (
            <span key={`${e.personaId ?? e.nombre}-${i}`} className="inline-flex max-w-full items-center gap-1 rounded-sm bg-muted py-0.5 pr-0.5 pl-1.5 text-xs leading-4">
              {e.personaId ? <UserRound aria-hidden="true" className="size-3 shrink-0 text-brand-text" /> : null}
              <span className="min-w-0 break-words">{e.nombre}</span>
              {!e.personaId && <span className="sr-only"> (sin cuenta)</span>}
              <button
                type="button"
                tabIndex={-1}
                aria-label={`Quitar a ${e.nombre}`}
                // Keeps the focus in the input, so leaving the cell does not end the edit.
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => onQuitar(i)}
                className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:size-6"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label={etiqueta}
            aria-autocomplete="list"
            aria-expanded
            aria-controls={idLista}
            aria-activedescendant={elegida ? idOpcion(activo) : undefined}
            autoComplete="off"
            spellCheck={false}
            value={valor}
            onChange={(e) => onCambio(e.target.value)}
            onKeyDown={tecla}
            onBlur={onSalir}
            className="block min-w-[6rem] flex-1 border-0 bg-transparent p-0 text-[length:inherit] leading-5 outline-none"
          />
        </div>
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
        {aviso && <p className="px-2 py-1.5 text-[13px] text-muted-foreground">{aviso}</p>}
        <ul id={idLista} role="listbox" aria-label={`Personas para ${columna}`} className="max-h-[220px] overflow-y-auto">
          {personas.map((p, i) => (
            <li
              key={p.personaId}
              id={idOpcion(i)}
              role="option"
              aria-selected={i === activo}
              // Keeps the focus in the input, so leaving the cell does not save first.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onAgregar(p)}
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
        <p className="border-t border-border/60 px-2 pt-1.5 pb-1 text-xs text-muted-foreground">
          Solo sugiere a la lista de {nombreLista}. Un nombre escrito se guarda sin cuenta.
        </p>
      </PopoverContent>
    </Popover>
  )
}
