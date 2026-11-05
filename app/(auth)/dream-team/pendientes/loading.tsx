/**
 * Dream Team — loading skeleton for /dream-team/pendientes.
 *
 * Keeps the frame of the real screen (components/dream-team/pendientes/): the
 * hero, the "% en orden" card with the four metrics, and two groups with
 * skeleton rows (docs/design-system/patterns.md#empty-and-loading-states).
 */
import { PaginaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'
import { SkeletonLista } from '@/components/ui/estado-vacio-sistema'

export default function LoadingPendientes() {
  return (
    <PaginaSistema>
      <div className="space-y-2">
        <SkeletonSistema ancho="200px" alto="28px" />
        <SkeletonSistema ancho="300px" alto="18px" />
      </div>

      <div className="grid gap-2.5 md:gap-3 xl:grid-cols-[260px_minmax(0,1fr)]">
        <SkeletonSistema alto="112px" className="rounded-2xl" />
        <div className="grid grid-cols-2 gap-2.5 md:gap-3 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <SkeletonSistema key={i} alto="112px" className="rounded-2xl" />
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card">
            <SkeletonLista />
          </div>
        ))}
      </div>
    </PaginaSistema>
  )
}
