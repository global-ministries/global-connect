/**
 * Niños — loading skeleton for /ninos/salones: the page frame, the hero, the
 * tabs, «Probar reglas» and the two carpetas.
 */
import { PaginaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'

export default function Loading() {
  return (
    <PaginaSistema>
      <div className="space-y-2">
        <SkeletonSistema ancho="240px" alto="28px" />
        <SkeletonSistema ancho="420px" alto="16px" />
      </div>
      <SkeletonSistema ancho="180px" alto="36px" className="rounded-xl" />
      <div className="grid min-w-0 gap-4">
        <SkeletonSistema alto="200px" className="rounded-md" />
        {[0, 1].map((i) => (
          <div key={i} className="space-y-2 rounded-md border border-border bg-card p-3">
            <SkeletonSistema ancho="320px" alto="24px" />
            {[0, 1, 2, 3].map((j) => (
              <SkeletonSistema key={j} alto="36px" className="rounded-md" />
            ))}
          </div>
        ))}
      </div>
    </PaginaSistema>
  )
}
