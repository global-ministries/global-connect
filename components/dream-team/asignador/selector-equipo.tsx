'use client'

/**
 * Dream Team — the tree-aware equipo picker of the "Asignar servicio" panel.
 *
 * Each equipo shows its path from the top, like the Servidores "Área" filter
 * ("Waumba Land › Desmontaje"): the ancestors muted, the equipo itself bold.
 * A filter box narrows the list by any part of the path. It is a radiogroup:
 * arrow keys move between the visible options.
 */
import { useId, useMemo, useState, type KeyboardEvent, type ReactElement } from 'react'
import { Search } from 'lucide-react'

import { InputSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'
import { coincideRuta, textoRuta, type EquipoElegible } from './logica'

const UMBRAL_FILTRO = 6

export interface SelectorEquipoProps {
  readonly equipos: readonly EquipoElegible[]
  readonly valor: string
  readonly onCambio: (equipoId: string) => void
}

export function SelectorEquipo({ equipos, valor, onCambio }: SelectorEquipoProps): ReactElement {
  const [query, setQuery] = useState('')
  const etiquetaId = useId()
  const visibles = useMemo(() => equipos.filter((e) => coincideRuta(e.ruta, query)), [equipos, query])

  function moverCon(e: KeyboardEvent<HTMLButtonElement>, indice: number): void {
    const delta = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (delta === 0 || visibles.length === 0) return
    e.preventDefault()
    const siguiente = visibles[(indice + delta + visibles.length) % visibles.length]
    onCambio(siguiente.id)
    const grupo = e.currentTarget.closest('[role="radiogroup"]')
    grupo?.querySelector<HTMLButtonElement>(`[data-equipo-id="${siguiente.id}"]`)?.focus()
  }

  const indiceElegido = visibles.findIndex((e) => e.id === valor)

  return (
    <div className="grid gap-2">
      <TextoSistema id={etiquetaId} tamaño="sm" className="font-medium">
        Equipo
      </TextoSistema>
      {equipos.length > UMBRAL_FILTRO && (
        <InputSistema
          icono={Search}
          aria-label="Filtrar equipos"
          placeholder="Filtrar por área o equipo…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {equipos.length === 0 ? (
        <TextoSistema variante="sutil" tamaño="sm">
          No hay equipos disponibles.
        </TextoSistema>
      ) : (
        <div
          role="radiogroup"
          aria-labelledby={etiquetaId}
          className="max-h-[45vh] overflow-y-auto rounded-md border border-border"
        >
          {visibles.length === 0 && (
            <TextoSistema variante="sutil" tamaño="sm" className="px-3 py-2">
              Ningún equipo coincide.
            </TextoSistema>
          )}
          {visibles.map((equipo, i) => {
            const elegido = equipo.id === valor
            const ancestros = equipo.ruta.slice(0, -1)
            const nombre = equipo.ruta[equipo.ruta.length - 1] ?? ''
            const enfocable = indiceElegido === -1 ? i === 0 : elegido
            return (
              <button
                key={equipo.id}
                type="button"
                role="radio"
                aria-checked={elegido}
                aria-label={textoRuta(equipo.ruta)}
                data-equipo-id={equipo.id}
                tabIndex={enfocable ? 0 : -1}
                onClick={() => onCambio(equipo.id)}
                onKeyDown={(e) => moverCon(e, i)}
                className={cn(
                  'flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-b-0',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  elegido ? 'bg-primary/10' : 'hover:bg-muted',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-3.5 shrink-0 rounded-full border',
                    elegido ? 'border-4 border-primary' : 'border-muted-foreground/50',
                  )}
                />
                <span className="min-w-0 flex-1 truncate">
                  {ancestros.length > 0 && (
                    <span className="text-muted-foreground">{`${textoRuta(ancestros)} › `}</span>
                  )}
                  <span className="font-medium">{nombre}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
