/**
 * Grupos de Vida — loading skeleton for /grupos-vida/planificar. Mirrors the
 * board (components/grupos-vida/planner/): season header, toolbar row, two
 * lanes of compact cards and the people bank.
 */
import { PaginaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'
import { SkeletonLista } from '@/components/ui/estado-vacio-sistema'

export default function LoadingPlanificar() {
  return (
    <PaginaSistema titulo="Planificar temporada">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <SkeletonSistema ancho="260px" alto="30px" />
          <SkeletonSistema ancho="320px" alto="16px" />
        </div>
        <div className="flex gap-2">
          <SkeletonSistema ancho="180px" alto="36px" />
          <SkeletonSistema ancho="200px" alto="36px" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <SkeletonSistema ancho="220px" alto="44px" />
        <SkeletonSistema ancho="320px" alto="44px" />
        <SkeletonSistema ancho="200px" alto="44px" />
        <SkeletonSistema ancho="140px" alto="36px" />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-8">
          {[0, 1].map((carril) => (
            <div key={carril} className="space-y-3">
              <SkeletonSistema ancho="200px" alto="20px" />
              <div className="flex gap-3 overflow-hidden">
                {[0, 1, 2, 3].map((i) => (
                  <SkeletonSistema key={i} ancho="175px" alto="220px" className="shrink-0 rounded-2xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <SkeletonSistema ancho="160px" alto="20px" />
          <SkeletonSistema alto="44px" />
          <SkeletonLista filas={5} />
        </div>
      </div>
    </PaginaSistema>
  )
}
