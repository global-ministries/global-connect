/**
 * Estudiantes — loading skeleton for /estudiantes/vivo. Keeps the planning
 * style frame of the real screen (components/estudiantes/vivo/): the band
 * with the date pill and the summary, the side bar from lg, the toolbar and
 * the groups with six skeleton rows
 * (docs/design-system/patterns.md#empty-and-loading-states).
 */
import { EsqueletoPlanificacion } from '@/components/estudiantes/planificacion/esqueleto-planificacion'

export default function LoadingEstudiantesVivo() {
  return <EsqueletoPlanificacion titulo="En vivo" barraLateral="vivo" />
}
