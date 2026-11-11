/**
 * Loading frame of /talleres (R3c, odd/tasks/talleres-rediseno.md): the v2
 * shape of the catálogo — hero, the four attention metrics, the two
 * dirección cards and the list rows — not a spinner.
 */
import { PaginaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'
import { SkeletonLista } from '@/components/ui/estado-vacio-sistema'

export default function LoadingTalleres() {
  return (
    <PaginaSistema>
      <div className="grid gap-2">
        <SkeletonSistema ancho="160px" alto="28px" />
        <SkeletonSistema ancho="60%" alto="16px" />
      </div>
      <div className="grid grid-cols-2 gap-2.5 md:gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonSistema key={i} alto="96px" className="rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-2.5 md:grid-cols-2 md:gap-3">
        {[0, 1].map((i) => (
          <SkeletonSistema key={i} alto="88px" className="rounded-2xl" />
        ))}
      </div>
      <div className="min-w-0 overflow-hidden rounded-2xl bg-card md:border md:border-border/60">
        <SkeletonLista filas={5} />
      </div>
    </PaginaSistema>
  )
}
