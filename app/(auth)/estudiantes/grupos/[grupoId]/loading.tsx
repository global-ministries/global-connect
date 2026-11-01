/**
 * Estudiantes — loading skeleton for the leader list. Keeps the frame of the
 * real screen (components/estudiantes/lista/): the title and its two lines,
 * the search, the pills and the list with six skeleton rows
 * (docs/design-system/patterns.md#empty-and-loading-states).
 */
import { PaginaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'
import { SkeletonLista } from '@/components/ui/estado-vacio-sistema'

export default function LoadingListaGrupo() {
  return (
    <PaginaSistema>
      <div className="space-y-2">
        <SkeletonSistema ancho="220px" alto="28px" />
        <SkeletonSistema ancho="260px" alto="18px" />
        <SkeletonSistema ancho="300px" alto="18px" />
      </div>

      <div className="space-y-3">
        <SkeletonSistema alto="44px" />
        <div className="flex gap-2 overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <SkeletonSistema key={i} ancho="104px" alto="44px" className="shrink-0 rounded-full" />
          ))}
        </div>
      </div>

      <div className="min-w-0 overflow-hidden rounded-2xl bg-card md:border md:border-border/60">
        <SkeletonLista />
      </div>
    </PaginaSistema>
  )
}
