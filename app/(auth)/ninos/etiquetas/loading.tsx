/**
 * Niños — loading skeleton for /ninos/etiquetas: the page frame, the hero,
 * the tabs, the stations and the reprints cards.
 */
import { PaginaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'

export default function Loading() {
  return (
    <PaginaSistema>
      <div className="space-y-2">
        <SkeletonSistema ancho="260px" alto="28px" />
        <SkeletonSistema ancho="420px" alto="16px" />
      </div>
      <SkeletonSistema ancho="240px" alto="36px" className="rounded-xl" />
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-2 rounded-md border border-border bg-card p-3">
            <SkeletonSistema ancho="200px" alto="20px" />
            {[0, 1, 2].map((j) => (
              <SkeletonSistema key={j} alto="52px" className="rounded-md" />
            ))}
          </div>
        ))}
      </div>
    </PaginaSistema>
  )
}
