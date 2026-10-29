/**
 * Estudiantes — loading skeleton for /estudiantes/grupos. Keeps the frame of
 * the real screen (components/estudiantes/grupos/): the hero, the toolbar,
 * the three attention metrics and the list with six skeleton rows
 * (docs/design-system/patterns.md#empty-and-loading-states).
 */
import { PaginaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'
import { SkeletonLista } from '@/components/ui/estado-vacio-sistema'

export default function LoadingEstudiantesGrupos() {
  return (
    <PaginaSistema>
      <div>
        <h1 className="hidden text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground md:block">Grupos</h1>
        <SkeletonSistema ancho="260px" alto="18px" className="mt-3 md:mt-2" />
      </div>

      <div className="flex flex-wrap gap-2.5">
        <SkeletonSistema alto="44px" className="min-w-0 flex-[1_1_100%] md:flex-[1_1_280px]" />
        <SkeletonSistema ancho="104px" alto="44px" className="hidden md:block" />
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:gap-3 lg:grid-cols-4">
        {[...Array(3)].map((_, i) => (
          <SkeletonSistema key={i} alto="112px" className="rounded-2xl" />
        ))}
      </div>

      <div className="min-w-0 overflow-hidden rounded-2xl bg-card md:border md:border-border/60">
        <SkeletonLista />
      </div>
    </PaginaSistema>
  )
}
