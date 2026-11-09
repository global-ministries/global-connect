/**
 * Estudiantes — loading skeleton for /estudiantes/grupos. Keeps the frame of
 * the real screen (components/estudiantes/grupos/, planning style of
 * design/estudiantes-dps 11 / 12): the header band, the «barra de alcance»
 * (Ámbitos, Necesitan atención), the toolbar and the table with skeleton
 * rows (docs/design-system/patterns.md#empty-and-loading-states).
 */
import { EsqueletoAlcance } from '@/components/estudiantes/alcance/esqueleto-alcance'

export default function LoadingEstudiantesGrupos() {
  return <EsqueletoAlcance titulo="Grupos" secciones={[5, 3]} />
}
