/**
 * Planner — the page-level states without a board: no season in planning
 * (artboard 10 `#entrada` / `#etapa`) and a load error. Server-safe.
 */
import type { ReactElement } from 'react'
import Link from 'next/link'
import { CalendarPlus, CalendarX, TriangleAlert, type LucideIcon } from 'lucide-react'

import { BotonSistema, PaginaSistema } from '@/components/ui/sistema-diseno'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'

import { MigasPlanner } from './migas-planner'

const RUTA = '/grupos-vida/planificar'

function Marco({
  migas,
  icono,
  titulo,
  subtitulo,
  accion,
}: {
  readonly migas: string
  readonly icono: LucideIcon
  readonly titulo: string
  readonly subtitulo: string
  readonly accion?: ReactElement
}): ReactElement {
  return (
    <PaginaSistema titulo="Planificar temporada" breadcrumbs={<MigasPlanner actual={migas} />}>
      <div className="rounded-2xl border border-border bg-card py-6">
        <EstadoVacioSistema icono={icono} titulo={titulo} subtitulo={subtitulo} accion={accion} />
      </div>
    </PaginaSistema>
  )
}

/** S18: the director general (admin, pastor) can open a new season; a director de etapa waits. */
export function PlannerSinTemporada({ puedeCrearTemporada }: { readonly puedeCrearTemporada: boolean }): ReactElement {
  return puedeCrearTemporada ? (
    <Marco
      migas="Planificar temporada"
      icono={CalendarPlus}
      titulo="No hay ninguna temporada en planificación"
      subtitulo="Abre la próxima temporada para empezar a armar sus grupos."
      accion={
        <BotonSistema asChild variante="primario" tamaño="sm">
          <Link href={`${RUTA}/nueva`}>Planificar nueva temporada</Link>
        </BotonSistema>
      }
    />
  ) : (
    <Marco
      migas="Planificar temporada"
      icono={CalendarX}
      titulo="El director general todavía no abrió la próxima temporada"
      subtitulo="Cuando la abra, aquí vas a ver los grupos de tus segmentos."
    />
  )
}

export function PlannerError({ mensaje }: { readonly mensaje: string }): ReactElement {
  return <Marco migas="Planificar temporada" icono={TriangleAlert} titulo="No se pudo abrir el planificador" subtitulo={mensaje} />
}
