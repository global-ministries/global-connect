/**
 * Dream Team — loading skeleton for /dream-team/mi-equipo.
 *
 * Keeps the frame of the real screen (components/dream-team/mi-equipo/): the
 * hero (the dirección is not known yet: a bar where the 24px title goes; on
 * phones the app shell header already says "Mi equipo"), the toolbar, the
 * four attention metrics, the scope cards and the list with six skeleton rows
 * (docs/design-system/patterns.md#empty-and-loading-states).
 */
import { PaginaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'
import { SkeletonLista } from '@/components/ui/estado-vacio-sistema'

export default function LoadingMiEquipo() {
  return (
    <PaginaSistema>
      <div className="space-y-2">
        <SkeletonSistema ancho="260px" alto="28px" />
        <SkeletonSistema ancho="220px" alto="18px" />
      </div>

      <div className="flex flex-wrap gap-2.5">
        <SkeletonSistema alto="44px" className="min-w-0 flex-[1_1_100%] md:flex-[1_1_280px]" />
        <SkeletonSistema ancho="104px" alto="44px" className="hidden md:block" />
        <SkeletonSistema ancho="220px" alto="44px" className="hidden md:block" />
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:gap-3 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <SkeletonSistema key={i} alto="112px" className="rounded-2xl" />
        ))}
      </div>

      <div className="grid gap-2.5 md:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] md:gap-3">
        {[...Array(4)].map((_, i) => (
          <SkeletonSistema key={i} alto="148px" className="rounded-2xl" />
        ))}
      </div>

      <div className="min-w-0 overflow-hidden rounded-2xl bg-card md:border md:border-border/60">
        <SkeletonLista />
      </div>
    </PaginaSistema>
  )
}
