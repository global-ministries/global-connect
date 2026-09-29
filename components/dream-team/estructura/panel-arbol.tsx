'use client'

/**
 * Estructura — the org chart pane.
 *
 * `ArbolNavegable` is the body (search, the flattened rows, the folded
 * "Inactivas" group) and is what a phone shows full-screen; `PanelOrganigrama`
 * wraps it as the desktop pane with its close button, and `RielOrganigrama`
 * is the narrow strip left behind when the pane is closed.
 *
 * Every row is a real button (`aria-pressed` for the selected one) with a
 * separate chevron button (`aria-expanded`, named after its node) so folding
 * a branch never selects it.
 */
import type { ReactElement } from 'react'
import { ChevronRight, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react'

import { InputSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'
import type { FilaArbol } from '@/lib/platform/dream-team/estructura-vista'

import { ANILLO_FOCO } from './mensajes'

export interface ArbolNavegableProps {
  readonly filas: readonly FilaArbol[]
  readonly inactivas: readonly FilaArbol[]
  readonly query: string
  readonly onQueryChange: (query: string) => void
  readonly seleccionadoId: string
  readonly inactivasAbiertas: boolean
  readonly onAlternarInactivas: () => void
  readonly onSeleccionar: (equipoId: string) => void
  readonly onAlternarNodo: (equipoId: string) => void
}

function FilaDelArbol({
  fila,
  seleccionado,
  onSeleccionar,
  onAlternarNodo,
}: {
  readonly fila: FilaArbol
  readonly seleccionado: boolean
  readonly onSeleccionar: (equipoId: string) => void
  readonly onAlternarNodo: (equipoId: string) => void
}): ReactElement {
  return (
    <li className="flex items-center gap-0.5" style={{ paddingLeft: fila.profundidad * 18 }}>
      {fila.tieneHijos ? (
        <button
          type="button"
          aria-expanded={fila.abierto}
          aria-label={`${fila.abierto ? 'Contraer' : 'Expandir'} ${fila.label}`}
          onClick={() => onAlternarNodo(fila.id)}
          className={cn(
            'flex h-11 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            ANILLO_FOCO,
          )}
        >
          <ChevronRight
            aria-hidden="true"
            className={cn('h-4 w-4 transition-transform duration-200', fila.abierto && 'rotate-90')}
          />
        </button>
      ) : (
        <span aria-hidden="true" className="w-8 shrink-0" />
      )}
      <button
        type="button"
        aria-pressed={seleccionado}
        onClick={() => onSeleccionar(fila.id)}
        className={cn(
          'flex min-h-[44px] min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border px-3 text-left text-sm text-foreground transition-colors',
          seleccionado
            ? 'border-[var(--brand-primary)] bg-[var(--brand-accent)] font-semibold'
            : cn('border-transparent hover:bg-accent', fila.profundidad === 0 ? 'font-semibold' : 'font-medium'),
          !fila.activo && !seleccionado && 'text-muted-foreground',
          ANILLO_FOCO,
        )}
      >
        <span className="truncate">{fila.label}</span>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{fila.personasRama}</span>
      </button>
    </li>
  )
}

export function ArbolNavegable({
  filas,
  inactivas,
  query,
  onQueryChange,
  seleccionadoId,
  inactivasAbiertas,
  onAlternarInactivas,
  onSeleccionar,
  onAlternarNodo,
}: ArbolNavegableProps): ReactElement {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pb-3 sm:px-5">
        <InputSistema
          type="search"
          icono={Search}
          aria-label="Buscar equipo"
          placeholder="Buscar equipo"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 sm:px-3">
        {filas.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">Ningún equipo coincide con esa búsqueda.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {filas.map((fila) => (
              <FilaDelArbol
                key={fila.id}
                fila={fila}
                seleccionado={fila.id === seleccionadoId}
                onSeleccionar={onSeleccionar}
                onAlternarNodo={onAlternarNodo}
              />
            ))}
          </ul>
        )}

        {inactivas.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              aria-expanded={inactivasAbiertas}
              onClick={onAlternarInactivas}
              className={cn(
                'flex min-h-[44px] w-full items-center justify-between rounded-xl px-3 text-left text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent',
                ANILLO_FOCO,
              )}
            >
              <span>Inactivas · {inactivas.length}</span>
              <span className="text-xs font-medium">{inactivasAbiertas ? 'Ocultar' : 'Mostrar'}</span>
            </button>
            {inactivasAbiertas && (
              <ul className="mt-0.5 flex flex-col gap-0.5">
                {inactivas.map((fila) => (
                  <FilaDelArbol
                    key={fila.id}
                    fila={fila}
                    seleccionado={fila.id === seleccionadoId}
                    onSeleccionar={onSeleccionar}
                    onAlternarNodo={onAlternarNodo}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export interface PanelOrganigramaProps extends ArbolNavegableProps {
  readonly onCerrar: () => void
}

/** The desktop pane: title, close button and the navigable tree. */
export function PanelOrganigrama({ onCerrar, ...arbol }: PanelOrganigramaProps): ReactElement {
  return (
    <aside
      aria-label="Organigrama"
      className="hidden min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card lg:sticky lg:top-24 lg:flex lg:max-h-[calc(100vh-8rem)] lg:w-96 lg:shrink-0"
    >
      <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-4 sm:px-5">
        <TituloSistema nivel={2} className="text-xl">
          Organigrama
        </TituloSistema>
        <button
          type="button"
          aria-label="Cerrar el organigrama"
          title="Cerrar el organigrama"
          aria-expanded={true}
          onClick={onCerrar}
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            ANILLO_FOCO,
          )}
        >
          <PanelLeftClose aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>
      <ArbolNavegable {...arbol} />
    </aside>
  )
}

/** What is left of the pane when it is closed: one button to open it again. */
export function RielOrganigrama({ onAbrir }: { readonly onAbrir: () => void }): ReactElement {
  return (
    <div className="hidden w-16 shrink-0 justify-center lg:flex">
      <button
        type="button"
        aria-label="Abrir el organigrama"
        title="Abrir el organigrama"
        aria-expanded={false}
        onClick={onAbrir}
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-foreground transition-colors hover:bg-accent',
          ANILLO_FOCO,
        )}
      >
        <PanelLeftOpen aria-hidden="true" className="h-5 w-5" />
      </button>
    </div>
  )
}
