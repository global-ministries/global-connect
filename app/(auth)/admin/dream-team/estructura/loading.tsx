/**
 * Dream Team — loading skeleton for /admin/dream-team/estructura.
 *
 * Mirrors the real two-pane layout: the org chart pane (search + tree rows,
 * desktop only) and the team detail (path, title, three summary cards and two
 * lists), per docs/sistema-diseno.md's `loading.tsx` skeleton pattern.
 */
import { ContenedorDashboard, SkeletonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'

export default function LoadingEstructura() {
  return (
    <ContenedorDashboard titulo="Estructura">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <TarjetaSistema className="hidden w-96 shrink-0 space-y-3 p-4 lg:block">
          <SkeletonSistema alto="24px" ancho="140px" />
          <SkeletonSistema alto="44px" />
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-2" style={{ marginLeft: (i % 3) * 18 }}>
              <SkeletonSistema alto="44px" />
            </div>
          ))}
        </TarjetaSistema>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <div className="space-y-3">
            <SkeletonSistema alto="16px" ancho="240px" />
            <SkeletonSistema alto="36px" ancho="320px" />
            <SkeletonSistema alto="24px" ancho="200px" />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <SkeletonSistema key={i} alto="108px" className="rounded-2xl" />
            ))}
          </div>
          <TarjetaSistema className="space-y-3 p-0">
            <div className="space-y-2 border-b border-border px-6 py-4">
              <SkeletonSistema alto="20px" ancho="140px" />
              <SkeletonSistema alto="14px" ancho="180px" />
            </div>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="px-6 pb-3">
                <SkeletonSistema alto="40px" />
              </div>
            ))}
          </TarjetaSistema>
        </div>
      </div>
    </ContenedorDashboard>
  )
}
