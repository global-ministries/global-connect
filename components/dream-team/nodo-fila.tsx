'use client'

/**
 * Dream Team — shared org-tree node row.
 *
 * Used by both /admin/dream-team/estructura (with edit actions in
 * `accesorio`) and /dream-team/mi-equipo (with a person-count accessory
 * instead) so the two screens render the exact same row instead of
 * diverging. Renders ONE row: an optional collapse chevron, the equipo
 * name, its experiencia badge (always via `experienciaLabel` — never the
 * raw catalog key), an "Inactiva" badge when the equipo is deactivated, its
 * roles as small read-only badges (always via `rolLabel`), and a trailing
 * `accesorio` slot for whatever the caller needs on the right.
 *
 * Indentation is capped so a deep branch never pushes content off-screen at
 * phone width (~400px), plus a subtle vertical guide border on nested
 * levels. Collapsing itself is owned by the caller (a `Set` of collapsed
 * ids, same pattern as GruposList.client.tsx's show/hide toggle) — this
 * component only renders the chevron and reports clicks.
 */
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { BadgeSistema } from '@/components/ui/sistema-diseno'
import { experienciaLabel, rolLabel, rolBadgeVariante } from './labels'
import type { DreamTeamEquipo, DreamTeamRol } from '@/lib/platform/dream-team/types'

export const NODO_FILA_INDENTACION_PX_POR_NIVEL = 14
export const NODO_FILA_INDENTACION_PX_MAXIMA = 70

export interface NodoFilaProps {
  readonly equipo: DreamTeamEquipo
  readonly roles: readonly DreamTeamRol[]
  readonly nivel: number
  readonly tieneHijos: boolean
  readonly expandido: boolean
  readonly onToggleExpandido: () => void
  /** Trailing content on the right of the row: edit actions, a person count, etc. */
  readonly accesorio?: ReactNode
}

export function NodoFila({
  equipo,
  roles,
  nivel,
  tieneHijos,
  expandido,
  onToggleExpandido,
  accesorio,
}: NodoFilaProps): ReactElement {
  const indentacion = Math.min(nivel * NODO_FILA_INDENTACION_PX_POR_NIVEL, NODO_FILA_INDENTACION_PX_MAXIMA)
  const ChevronIcon = expandido ? ChevronDown : ChevronRight

  return (
    <div
      style={{ marginLeft: indentacion }}
      className={cn('min-w-0 py-3', nivel > 0 && 'border-l border-border pl-3', !equipo.activo && 'opacity-60')}
    >
      <div className="flex flex-wrap items-center gap-2">
        {tieneHijos ? (
          <button
            type="button"
            onClick={onToggleExpandido}
            aria-expanded={expandido}
            aria-label={expandido ? `Colapsar ${equipo.label}` : `Expandir ${equipo.label}`}
            title={expandido ? 'Colapsar' : 'Expandir'}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <span className="h-11 w-11 flex-shrink-0" aria-hidden="true" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 break-words font-medium text-foreground">{equipo.label}</span>
            <BadgeSistema variante="info" tamaño="sm">
              {experienciaLabel(equipo.experiencia)}
            </BadgeSistema>
            {!equipo.activo && (
              <BadgeSistema variante="default" tamaño="sm">
                Inactiva
              </BadgeSistema>
            )}
          </div>
          {roles.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {roles.map((rol) => (
                <BadgeSistema key={rol.id} variante={rolBadgeVariante(rol.label)} tamaño="sm">
                  {rolLabel(rol.label)}
                </BadgeSistema>
              ))}
            </div>
          )}
        </div>

        {accesorio && <div className="flex flex-shrink-0 items-center gap-1">{accesorio}</div>}
      </div>
    </div>
  )
}
