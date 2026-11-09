/**
 * Estudiantes — loading skeleton for /estudiantes/promocion. Keeps the frame
 * of the real screen (components/estudiantes/promocion/, planning style of
 * design/estudiantes-dps 13 / 14): the header band, the «barra de alcance»
 * (Resumen, Ámbitos, Además), the toolbar and skeleton rows
 * (docs/design-system/patterns.md#empty-and-loading-states).
 */
import { EsqueletoAlcance } from '@/components/estudiantes/alcance/esqueleto-alcance'

export default function LoadingEstudiantesPromocion() {
  return <EsqueletoAlcance titulo="Promover temporada" secciones={[4, 2, 1]} herramientas={['280px', '360px']} />
}
