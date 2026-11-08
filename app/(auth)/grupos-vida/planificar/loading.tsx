/**
 * Grupos de Vida — loading skeleton for /grupos-vida/planificar. Mirrors the
 * board (components/grupos-vida/planner/) in the planning style's wide layout
 * (S25): the header band, the toolbar row, two lanes of flat group columns
 * and the people bank as a full-height sidebar.
 */
import { PaginaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'
import { SkeletonLista } from '@/components/ui/estado-vacio-sistema'

export default function LoadingPlanificar() {
  return (
    <PaginaSistema titulo="Planificar temporada">
      <div className="flex min-h-[32rem] flex-col md:-m-6 md:h-[calc(100dvh-4rem)] lg:-mx-12 lg:-my-8">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 md:border-b md:border-border md:bg-card md:px-6 md:pt-4">
          <div className="space-y-2">
            <SkeletonSistema ancho="260px" alto="30px" />
            <SkeletonSistema ancho="320px" alto="16px" />
          </div>
          <div className="flex gap-2">
            <SkeletonSistema ancho="180px" alto="36px" />
            <SkeletonSistema ancho="200px" alto="36px" />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 py-3 md:px-6">
          <SkeletonSistema ancho="180px" alto="36px" />
          <SkeletonSistema ancho="320px" alto="44px" />
          <SkeletonSistema ancho="200px" alto="44px" />
          <SkeletonSistema ancho="140px" alto="36px" />
        </div>

        <div className="min-h-0 flex-1 overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-7 pt-1 pb-8 md:px-6">
            {[0, 1].map((carril) => (
              <div key={carril} className="space-y-3">
                <SkeletonSistema ancho="200px" alto="20px" />
                <div className="flex gap-3 overflow-hidden">
                  {[0, 1, 2, 3].map((i) => (
                    <SkeletonSistema key={i} ancho="190px" alto="220px" className="shrink-0 rounded-md" />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="hidden space-y-3 border-l border-border bg-card px-4 pt-3.5 lg:block">
            <SkeletonSistema ancho="160px" alto="20px" />
            <SkeletonSistema alto="44px" />
            <SkeletonLista filas={5} />
          </div>
        </div>
      </div>
    </PaginaSistema>
  )
}
