'use client'

/**
 * Dream Team — shared org-tree node row.
 *
 * Used by both /admin/dream-team/estructura (with edit actions in
 * `accesorio`) and /dream-team/mi-equipo (with a person-count accessory
 * instead) so the two screens render the exact same row instead of
 * diverging. Renders ONE row: an optional collapse chevron, the equipo
 * name, an origin-appropriate badge (its experiencia for a Dream Team node,
 * the "Grupos de Vida" marker for a virtual node — see
 * lib/platform/dream-team/estructura-arbol.ts), an "Inactiva" badge when the
 * equipo is deactivated, a "who is responsible for this node" line when it
 * has any responsables, its roles as small read-only badges (always via
 * `rolLabel`), and a trailing `accesorio` slot for whatever the caller needs
 * on the right.
 *
 * A virtual Grupos de Vida node is read-only by construction: it is never a
 * `dream_team_equipos` row, so it never HAS roles of its own (the `roles`
 * prop naturally comes back empty for it) and the caller never passes it any
 * edit accesorio (see estructura-client.tsx) — this component doesn't police
 * that itself, since only the caller knows what "editable" means for a row.
 *
 * Indentation is capped so a deep branch never pushes content off-screen at
 * phone width (~400px), plus a subtle vertical guide border on nested
 * levels. Collapsing itself is owned by the caller (a `Set` of collapsed
 * ids, same pattern as GruposList.client.tsx's show/hide toggle) — this
 * component only renders the chevron and reports clicks.
 */
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Fragment, type ReactElement, type ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { BadgeSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { experienciaLabel, rolLabel, rolBadgeVariante, rolResponsableGdvLabel, ORIGEN_GRUPOS_VIDA_LABEL } from './labels'
import type { DreamTeamRol } from '@/lib/platform/dream-team/types'
import type { NodoEquipoArbol } from '@/lib/platform/dream-team/estructura-arbol'

export const NODO_FILA_INDENTACION_PX_POR_NIVEL = 14
export const NODO_FILA_INDENTACION_PX_MAXIMA = 70

export interface NodoFilaProps {
  readonly equipo: NodoEquipoArbol
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
  const esGrupoVida = equipo.origen === 'grupos_vida'

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
            {esGrupoVida ? (
              <BadgeSistema variante="default" tamaño="sm">
                {ORIGEN_GRUPOS_VIDA_LABEL}
              </BadgeSistema>
            ) : (
              <BadgeSistema variante="info" tamaño="sm">
                {experienciaLabel(equipo.experiencia)}
              </BadgeSistema>
            )}
            {!equipo.activo && (
              <BadgeSistema variante="default" tamaño="sm">
                Inactiva
              </BadgeSistema>
            )}
          </div>

          {equipo.responsables.length > 0 && (
            <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
              {equipo.responsables.map((responsable, indice) => (
                <Fragment key={`${responsable.personaId}-${responsable.rol}`}>
                  {indice > 0 && ' · '}
                  <span>
                    {responsable.nombre} — {esGrupoVida ? rolResponsableGdvLabel(responsable.rol) : rolLabel(responsable.rol)}
                  </span>
                </Fragment>
              ))}
            </TextoSistema>
          )}

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
