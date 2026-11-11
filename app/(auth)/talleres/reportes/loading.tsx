/**
 * Loading frame of /talleres/reportes (R3g of odd/tasks/talleres-rediseno.md):
 * the real page's shape — crumbs, title and summary, the range pills, the
 * tabs and skeleton rows in the list card — not a spinner.
 */
import { MigasReportesTalleres } from '@/components/talleres/reportes/partes-reportes'
import { SkeletonLista } from '@/components/ui/estado-vacio-sistema'
import { PaginaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'

export default function LoadingReportes() {
  return (
    <PaginaSistema titulo="Reportes de talleres" breadcrumbs={<MigasReportesTalleres />}>
      <div className="grid gap-2">
        <SkeletonSistema ancho="55%" alto="28px" />
        <SkeletonSistema ancho="70%" alto="14px" />
      </div>
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <SkeletonSistema key={i} ancho="120px" alto="44px" className="rounded-full" />
        ))}
      </div>
      <SkeletonSistema ancho="360px" alto="40px" className="max-w-full rounded-xl" />
      <div className="min-w-0 overflow-hidden rounded-2xl bg-card md:border md:border-border/60">
        <SkeletonLista />
      </div>
    </PaginaSistema>
  )
}
