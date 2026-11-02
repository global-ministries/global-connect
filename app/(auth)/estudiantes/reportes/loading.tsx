/**
 * Estudiantes — loading skeleton for /estudiantes/reportes. Keeps the frame
 * of the real screen (components/estudiantes/reportes/): the hero, the
 * search, the range pills, the ámbito cards, the funnel steps, the tabs and
 * the list with skeleton rows (docs/design-system/patterns.md#empty-and-loading-states).
 */
import { PaginaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'
import { SkeletonLista } from '@/components/ui/estado-vacio-sistema'

export default function LoadingEstudiantesReportes() {
  return (
    <PaginaSistema>
      <div>
        <h1 className="hidden text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground md:block">Reportes de asistencia</h1>
        <SkeletonSistema ancho="460px" alto="18px" className="mt-3 max-w-full md:mt-2" />
      </div>

      <SkeletonSistema alto="44px" className="rounded-xl" />
      <SkeletonSistema ancho="560px" alto="44px" className="max-w-full rounded-full" />

      <div className="grid gap-3 md:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <SkeletonSistema key={i} alto="120px" className="rounded-2xl" />
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <SkeletonSistema key={i} alto="132px" className="rounded-2xl" />
        ))}
      </div>

      <SkeletonSistema ancho="220px" alto="40px" className="rounded-xl" />
      <div className="min-w-0 overflow-hidden rounded-2xl bg-card md:border md:border-border/60">
        <SkeletonLista />
      </div>
    </PaginaSistema>
  )
}
