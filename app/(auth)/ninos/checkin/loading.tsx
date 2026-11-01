/**
 * Niños — loading skeleton for /ninos/checkin. Keeps the frame of the real
 * screen (components/ninos/checkin-client.tsx, design-system v2): the hero
 * with its summary line, service + Ingreso / Retiro, the salón chips, then
 * the queue and the mesa side by side from md and the salones column from lg
 * (docs/design-system/patterns.md#empty-and-loading-states).
 */
import { SkeletonLista } from '@/components/ui/estado-vacio-sistema'
import { PaginaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'

export default function Loading() {
  return (
    <PaginaSistema>
      <div>
        <h1 className="text-[28px] font-bold leading-[1.1] tracking-[-0.03em] text-foreground md:text-2xl md:font-[650] md:leading-[1.15] md:tracking-[-0.02em]">
          Check-in
        </h1>
        <SkeletonSistema ancho="360px" alto="18px" className="mt-2 max-w-full" />
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end lg:max-w-[720px]">
        <div className="grid grid-cols-2 gap-3">
          <SkeletonSistema alto="44px" className="rounded-xl" />
          <SkeletonSistema alto="44px" className="rounded-xl" />
        </div>
        <SkeletonSistema alto="44px" className="rounded-xl md:w-48" />
      </div>

      <div className="flex gap-2 overflow-hidden lg:hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <SkeletonSistema key={i} ancho="120px" alto="36px" className="shrink-0 rounded-full" />
        ))}
      </div>

      <div className="grid min-w-0 gap-6 md:grid-cols-2 md:items-start lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_272px]">
        <div className="min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card">
          <SkeletonLista filas={3} />
        </div>
        <div className="grid gap-3">
          <SkeletonSistema alto="44px" className="rounded-xl" />
          <SkeletonSistema alto="160px" className="hidden rounded-2xl md:block" />
        </div>
        <div className="hidden gap-3 lg:grid">
          <SkeletonSistema alto="60px" className="rounded-2xl" />
          <SkeletonSistema alto="280px" className="rounded-2xl" />
        </div>
      </div>
    </PaginaSistema>
  )
}
