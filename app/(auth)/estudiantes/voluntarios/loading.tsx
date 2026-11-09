/**
 * Estudiantes — loading skeleton for /estudiantes/voluntarios. Keeps the
 * planning style frame of the real screen
 * (components/estudiantes/voluntarios/): the band with the service, the date
 * pill and the summary, the Equipos bar from lg, the toolbar and the list
 * with six skeleton rows (docs/design-system/patterns.md#empty-and-loading-states).
 */
import { EsqueletoPlanificacion } from '@/components/estudiantes/planificacion/esqueleto-planificacion'

export default function LoadingEstudiantesVoluntarios() {
  return <EsqueletoPlanificacion titulo="Voluntarios" barraLateral="voluntarios" />
}
