/**
 * Niños — loading skeleton for /ninos/eventos: the page frame, the hero and
 * the two columns (list of events, open event with its cards).
 */
import { PaginaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'

export default function Loading() {
  return (
    <PaginaSistema>
      <div className="space-y-2">
        <SkeletonSistema ancho="240px" alto="28px" />
        <SkeletonSistema ancho="360px" alto="16px" />
      </div>
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-2 rounded-md border border-border bg-card p-3">
          {[0, 1, 2].map((i) => (
            <SkeletonSistema key={i} alto="64px" className="rounded-md" />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <SkeletonSistema alto="160px" className="rounded-md" />
            <SkeletonSistema alto="200px" className="rounded-md" />
          </div>
          <div className="space-y-4">
            <SkeletonSistema alto="150px" className="rounded-md" />
            <SkeletonSistema alto="240px" className="rounded-md" />
          </div>
        </div>
      </div>
    </PaginaSistema>
  )
}
