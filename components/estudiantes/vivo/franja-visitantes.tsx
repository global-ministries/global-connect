'use client'

/**
 * Estudiantes › En vivo — "Visitantes de hoy" (gap G2 of
 * design/estudiantes-asistencia, `FranjaVisitantes` under "Planned
 * components" in docs/design-system/components.md; Q5): the visitors present
 * at this meeting, newest first, as inset rows on every width (avatar
 * initials, name, "Nuevo" for a first visit, group and año, who registered
 * them and when). Phones show three and "Ver los N visitantes"; the rest are
 * hidden with CSS, so desktop always shows them all. A row opens its group's
 * detail. Not a live region: new visitors are announced by the toast.
 */
import { useState, type ReactElement } from 'react'
import { ChevronRight } from 'lucide-react'

import { BadgeSistema } from '@/components/ui/sistema-diseno'
import type { VisitanteHoy } from '@/lib/platform/estudiantes/vivo-datos'
import { lineaVisitante } from '@/lib/platform/estudiantes/vivo-vista'
import { cn } from '@/lib/utils'

import { ListaInset, TituloSeccion } from '../filas-inset'

/** Rows shown on phones before "Ver los N visitantes". */
export const CORTE_VISITANTES_MOVIL = 3

const iniciales = (nombre: string): string =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte.charAt(0).toLocaleUpperCase('es'))
    .join('')

/** "1er año · Chicas", plus the visitor's own año when the group name does not say it. */
function grupoYAnio(v: VisitanteHoy): string {
  const anio = v.anioEtiqueta && !(v.grupo ?? '').includes(v.anioEtiqueta) ? v.anioEtiqueta : null
  return [v.grupo, anio].filter(Boolean).join(' · ')
}

export function AvatarIniciales({ nombre }: { readonly nombre: string }): ReactElement {
  return (
    <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-tint text-sm font-semibold text-brand-text">
      {iniciales(nombre)}
    </span>
  )
}

export interface FranjaVisitantesProps {
  readonly visitantes: readonly VisitanteHoy[]
  readonly onAbrirGrupo: (grupoId: string) => void
}

export function FranjaVisitantes({ visitantes, onAbrirGrupo }: FranjaVisitantesProps): ReactElement {
  const [todas, setTodas] = useState(false)
  const ocultas = todas ? 0 : Math.max(0, visitantes.length - CORTE_VISITANTES_MOVIL)

  return (
    <section aria-labelledby="vivo-visitantes" className="space-y-3">
      <div className="px-1 md:px-0">
        <TituloSeccion id="vivo-visitantes" texto="Visitantes de hoy" cantidad={visitantes.length} pista={<span className="hidden md:inline">El más nuevo primero · se actualiza solo</span>} />
      </div>
      <ListaInset etiqueta="Visitantes de hoy">
        {visitantes.length === 0 && (
          <li className="px-3.5 py-3">
            <p className="text-[15px] font-semibold text-foreground">Todavía no hay visitantes</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">Aparecen aquí cuando un líder registra a alguien nuevo.</p>
          </li>
        )}
        {visitantes.map((v, i) => {
          const detalle = grupoYAnio(v)
          const linea = lineaVisitante(v)
          return (
            <li
              key={`${v.personaId}|${v.grupoId ?? ''}`}
              className={cn(
                'relative before:absolute before:top-0 before:right-0 before:left-[66px] before:h-px before:bg-border/60 first:before:hidden',
                !todas && i >= CORTE_VISITANTES_MOVIL && 'max-md:hidden',
              )}
            >
              <button
                type="button"
                disabled={!v.grupoId}
                onClick={() => v.grupoId && onAbrirGrupo(v.grupoId)}
                aria-label={[v.nombre, v.esNuevo ? 'primera vez' : null, detalle, linea].filter(Boolean).join(', ')}
                className="focus-ring relative flex min-h-[64px] w-full min-w-0 touch-manipulation items-center gap-3 px-3.5 py-2 text-left transition-colors active:bg-accent disabled:cursor-default md:hover:bg-accent/50"
              >
                <AvatarIniciales nombre={v.nombre} />
                <span className="min-w-0 flex-1" aria-hidden="true">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[15px] font-semibold text-foreground">{v.nombre}</span>
                    {v.esNuevo && (
                      <BadgeSistema variante="info" tamaño="sm" className="shrink-0">
                        Nuevo
                      </BadgeSistema>
                    )}
                  </span>
                  {detalle && <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{detalle}</span>}
                  {linea && <span className="block truncate text-[13px] text-muted-foreground">{linea}</span>}
                </span>
                {v.grupoId && <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
              </button>
            </li>
          )
        })}
        {ocultas > 0 && (
          <li className="relative before:absolute before:top-0 before:right-0 before:left-3.5 before:h-px before:bg-border/60 md:hidden">
            <button
              type="button"
              onClick={() => setTodas(true)}
              className="focus-ring flex min-h-[52px] w-full touch-manipulation items-center px-3.5 text-left text-[15px] font-semibold text-brand-text transition-colors active:bg-accent"
            >
              {`Ver los ${visitantes.length} visitantes`}
            </button>
          </li>
        )}
      </ListaInset>
    </section>
  )
}
