/**
 * Estudiantes — loading skeleton for /estudiantes/voluntarios. Keeps the
 * frame of the real screen (components/estudiantes/voluntarios/): the hero,
 * the Servicio / Fecha pickers, the search, the four metrics and the list
 * with six skeleton rows (docs/design-system/patterns.md#empty-and-loading-states).
 */
import { PaginaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'
import { SkeletonLista } from '@/components/ui/estado-vacio-sistema'

export default function LoadingEstudiantesVoluntarios() {
  return (
    <PaginaSistema>
      <div>
        <h1 className="hidden text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground md:block">Voluntarios</h1>
        <SkeletonSistema ancho="320px" alto="18px" className="mt-3 max-w-full md:mt-2" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-[720px]">
        <SkeletonSistema alto="44px" className="rounded-xl" />
        <SkeletonSistema alto="44px" className="rounded-xl" />
      </div>

      <SkeletonSistema alto="44px" className="rounded-xl" />

      <div className="grid grid-cols-2 gap-2.5 md:gap-3 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <SkeletonSistema key={i} alto="112px" className="rounded-2xl" />
        ))}
      </div>

      <div className="min-w-0 overflow-hidden rounded-2xl bg-card md:border md:border-border/60">
        <SkeletonLista />
      </div>
    </PaginaSistema>
  )
}
