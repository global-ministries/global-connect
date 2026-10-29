'use client'

/**
 * Estructura — the "Equipos" tab (S12): the toolbar and the org chart. From
 * md the chart is the connected diagram inside one card (toolbar on top,
 * canvas below, prototipos/estructura/07-b-escritorio.html); below md it is
 * the vertical indented chart (08-b-celular.html). The phone and desktop
 * trees differ, so the cut is read in JS (`useEsEscritorio`, the same 768px
 * as the node panel) and nothing chart-shaped renders on the server.
 */
import type { ReactElement } from 'react'

import { useEsEscritorio } from '@/components/ui/detalle-responsivo'
import { SkeletonSistema } from '@/components/ui/sistema-diseno'
import type { CajaOrganigrama, Organigrama, ProblemaEstructura } from '@/lib/platform/dream-team/estructura-organigrama'

import { BarraOrganigrama } from './barra-organigrama'
import { DiagramaOrganigrama } from './diagrama-organigrama'
import { OrganigramaVertical } from './organigrama-vertical'

export interface EquiposOrganigramaProps {
  readonly organigrama: Organigrama
  readonly cajas: readonly CajaOrganigrama[]
  /** Name of the campus box at the root. */
  readonly campus: string
  readonly q: string
  readonly onBuscar: (q: string) => void
  readonly problema: ProblemaEstructura | null
  readonly onProblema: (problema: ProblemaEstructura | null) => void
  readonly onAbrir: (id: string) => void
  readonly onPlegar: (id: string) => void
  readonly onExpandirTodo: () => void
  readonly onContraer: () => void
}

export function EquiposOrganigrama({
  organigrama,
  cajas,
  campus,
  q,
  onBuscar,
  problema,
  onProblema,
  onAbrir,
  onPlegar,
  onExpandirTodo,
  onContraer,
}: EquiposOrganigramaProps): ReactElement {
  const escritorio = useEsEscritorio()
  const resaltando = q.trim() !== '' || problema !== null
  const barra = (
    <BarraOrganigrama
      q={q}
      onBuscar={onBuscar}
      problema={problema}
      onProblema={onProblema}
      conteos={organigrama.conteos}
      resaltados={resaltando ? organigrama.resaltar({ q, problema }).ids.size : null}
    />
  )
  const grafico = {
    cajas,
    raices: organigrama.raices,
    raiz: { nombre: campus, personas: organigrama.resumen.personas },
    onAbrir,
    onPlegar,
    onExpandirTodo,
    onContraer,
  }

  if (escritorio === null) {
    return (
      <div role="status" aria-busy="true" className="grid gap-3">
        <span className="sr-only">Cargando el organigrama</span>
        <SkeletonSistema alto="44px" />
        <SkeletonSistema alto="460px" className="rounded-2xl" />
      </div>
    )
  }

  if (!escritorio) {
    return (
      <section aria-labelledby="organigrama-titulo" className="grid min-w-0 gap-4">
        <h2 id="organigrama-titulo" className="sr-only">
          Organigrama
        </h2>
        {barra}
        <OrganigramaVertical {...grafico} />
      </section>
    )
  }

  return (
    <section aria-labelledby="organigrama-titulo" className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
      <h2 id="organigrama-titulo" className="sr-only">
        Organigrama
      </h2>
      <div className="border-b border-border px-3.5 py-3">{barra}</div>
      <DiagramaOrganigrama {...grafico} />
    </section>
  )
}
