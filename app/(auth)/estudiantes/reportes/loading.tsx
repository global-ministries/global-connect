/**
 * Estudiantes — loading skeleton for /estudiantes/reportes. Keeps the frame
 * of the real screen (components/estudiantes/reportes/, planning style of
 * design/estudiantes-dps 15 / 16): the header band, the «barra de alcance»
 * (Ámbito, Sub-área, Embudo de conexión), the toolbar and the table with
 * skeleton rows (docs/design-system/patterns.md#empty-and-loading-states).
 */
import { EsqueletoAlcance } from '@/components/estudiantes/alcance/esqueleto-alcance'

export default function LoadingEstudiantesReportes() {
  return <EsqueletoAlcance titulo="Reportes de asistencia" secciones={[3, 3, 3]} herramientas={['200px', '280px', '140px', '180px']} />
}
