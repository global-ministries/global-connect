/**
 * Dream Team — loading skeleton for /admin/dream-team/estructura.
 *
 * Keeps the frame of the org chart screen (docs/design-system/patterns.md,
 * empty and loading states): the title with its summary and the tabs, then
 * the chart card with its toolbar (search and the four problem pills) and the
 * canvas. On phones the card becomes the search, the pills and a few boxes.
 */
import { PaginaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'

export default function LoadingEstructura() {
  return (
    <PaginaSistema>
      <div role="status" aria-busy="true" className="grid gap-6">
        <span className="sr-only">Cargando</span>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <SkeletonSistema alto="28px" ancho="160px" />
            <SkeletonSistema alto="16px" ancho="320px" />
          </div>
          <div className="w-full md:w-[260px]">
            <SkeletonSistema alto="44px" className="rounded-xl" />
          </div>
        </div>

        <div className="overflow-hidden md:rounded-2xl md:border md:border-border md:bg-card">
          <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:border-b md:border-border md:px-3.5 md:py-3">
            <div className="md:w-[300px] md:shrink-0">
              <SkeletonSistema alto="44px" className="rounded-xl" />
            </div>
            <div className="flex gap-2 overflow-hidden">
              {[...Array(4)].map((_, i) => (
                <SkeletonSistema key={i} alto="44px" ancho="140px" className="shrink-0 rounded-full" />
              ))}
            </div>
          </div>
          <div className="hidden h-[460px] md:block" />
          <div className="mt-4 grid gap-2 md:hidden">
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ marginLeft: Math.min(i, 2) * 30 }}>
                <SkeletonSistema alto="56px" className="rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PaginaSistema>
  )
}
