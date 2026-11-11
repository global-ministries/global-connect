/**
 * Loading frame of /talleres/temporadas (R3b, odd/tasks/talleres-rediseno.md):
 * the v2 shape — hero, the four attention metrics and the list rows.
 */
import { PaginaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'
import { SkeletonLista } from '@/components/ui/estado-vacio-sistema'

export default function LoadingTemporadas() {
  return (
    <PaginaSistema>
      <div className="grid gap-2">
        <SkeletonSistema ancho="180px" alto="28px" />
        <SkeletonSistema ancho="60%" alto="16px" />
      </div>
      <div className="grid grid-cols-2 gap-2.5 md:gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonSistema key={i} alto="96px" className="rounded-2xl" />
        ))}
      </div>
      <div className="min-w-0 overflow-hidden rounded-2xl bg-card md:border md:border-border/60">
        <SkeletonLista filas={5} />
      </div>
    </PaginaSistema>
  )
}
