'use client'

/**
 * Estudiantes › En vivo — "Visitantes de hoy" (gap G2 of
 * design/estudiantes-asistencia, `FranjaVisitantes` under "Planned
 * components" in docs/design-system/components.md; Q5), in the planning
 * style of artboards 04 / 05 of design/estudiantes-dps (B23, B27; S6): the
 * visitors present at this meeting, newest first (avatar, name, "Nuevo" for
 * a first visit, group and año, who registered them and when). A row opens
 * its group's detail. Not a live region: new visitors are announced by the
 * toast.
 *
 * - `VisitantesBarra`: the compact list of the side bar (from md).
 * - `VisitantesSeccion`: the phone section before the groups, under a
 *   sticky band: three rows and "Ver los N visitantes" (S6).
 *
 * `AvatarIniciales` (40px, brand tint) stays here for the other Estudiantes
 * drawers that use it.
 */
import { useState, type ReactElement } from 'react'
import { ChevronRight } from 'lucide-react'

import { BadgeSistema } from '@/components/ui/sistema-diseno'
import { AvatarIniciales as AvatarPlan } from '@/components/grupos-vida/planner/avatar-iniciales'
import type { VisitanteHoy } from '@/lib/platform/estudiantes/vivo-datos'
import { lineaVisitante } from '@/lib/platform/estudiantes/vivo-vista'
import { cn } from '@/lib/utils'

import { BandaSeccion, CLASE_LINEA, TablaPlanificacion } from '../planificacion/region-datos'

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

const claveVisitante = (v: VisitanteHoy): string => `${v.personaId}|${v.grupoId ?? ''}`

const etiquetaVisitante = (v: VisitanteHoy): string => [v.nombre, v.esNuevo ? 'primera vez' : null, grupoYAnio(v), lineaVisitante(v)].filter(Boolean).join(', ')

function Contenido({ visitante: v }: { readonly visitante: VisitanteHoy }): ReactElement {
  const detalle = grupoYAnio(v)
  const linea = lineaVisitante(v)
  return (
    <span className="min-w-0 flex-1" aria-hidden="true">
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-[15px] font-semibold text-foreground md:text-[13px]">{v.nombre}</span>
        {v.esNuevo && (
          <BadgeSistema variante="info" tamaño="sm" className="shrink-0">
            Nuevo
          </BadgeSistema>
        )}
      </span>
      {detalle && <span className="block truncate text-[13px] text-muted-foreground md:text-xs">{detalle}</span>}
      {linea && <span className="block truncate text-[13px] text-muted-foreground md:text-xs">{linea}</span>}
    </span>
  )
}

export interface VisitantesHoyProps {
  readonly visitantes: readonly VisitanteHoy[]
  readonly onAbrirGrupo: (grupoId: string) => void
}

const VACIO = 'Todavía no hay visitantes. Aparecen aquí cuando un líder registra a alguien nuevo.'

export function VisitantesBarra({ visitantes, onAbrirGrupo }: VisitantesHoyProps): ReactElement {
  return (
    <>
      <ul aria-label="Visitantes de hoy" className="[&>li+li]:border-t [&>li+li]:border-border/60">
        {visitantes.length === 0 && <li className="py-1.5 text-[13px] text-muted-foreground">{VACIO}</li>}
        {visitantes.map((v) => (
          <li key={claveVisitante(v)}>
            <button
              type="button"
              disabled={!v.grupoId}
              onClick={() => v.grupoId && onAbrirGrupo(v.grupoId)}
              aria-label={etiquetaVisitante(v)}
              className="focus-ring flex w-full min-w-0 items-start gap-2.5 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent"
            >
              <AvatarPlan nombres={[v.nombre]} className="mt-0.5" />
              <Contenido visitante={v} />
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs text-muted-foreground">El más nuevo primero · se actualiza solo</p>
    </>
  )
}

export function VisitantesSeccion({ visitantes, onAbrirGrupo }: VisitantesHoyProps): ReactElement {
  const [todas, setTodas] = useState(false)
  const visibles = todas ? visitantes : visitantes.slice(0, CORTE_VISITANTES_MOVIL)

  return (
    <TablaPlanificacion>
      <section aria-labelledby="vivo-visitantes-movil">
        <BandaSeccion id="vivo-visitantes-movil" titulo="Visitantes de hoy" cuenta={visitantes.length} />
        <ul aria-label="Visitantes de hoy">
          {visitantes.length === 0 && <li className="px-4 py-3.5 text-[13px] text-muted-foreground">{VACIO}</li>}
          {visibles.map((v) => (
            <li key={claveVisitante(v)} className={CLASE_LINEA}>
              <button
                type="button"
                disabled={!v.grupoId}
                onClick={() => v.grupoId && onAbrirGrupo(v.grupoId)}
                aria-label={etiquetaVisitante(v)}
                className="focus-ring flex min-h-16 w-full min-w-0 touch-manipulation items-center gap-3 py-2 pr-2 pl-4 text-left transition-colors active:bg-accent disabled:cursor-default"
              >
                <AvatarPlan nombres={[v.nombre]} className="size-8 text-xs" />
                <Contenido visitante={v} />
                {v.grupoId && <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
              </button>
            </li>
          ))}
        </ul>
        {!todas && visitantes.length > CORTE_VISITANTES_MOVIL && (
          <button
            type="button"
            onClick={() => setTodas(true)}
            className={cn('focus-ring flex min-h-[52px] w-full touch-manipulation items-center border-t border-border/60 px-4 text-left text-[15px] font-semibold text-brand-text transition-colors active:bg-accent')}
          >
            {`Ver los ${visitantes.length} visitantes`}
          </button>
        )}
      </section>
    </TablaPlanificacion>
  )
}
