/**
 * T9 (odd/tasks/talleres-consolidar-pantallas.md) — loading skeleton for
 * /talleres/mi-recorrido. Mirrors the real page's shape (docs/talleres-de-
 * punta-a-punta.md §9's loading.tsx pattern: imitate the real shape, not a
 * spinner) — a tab bar plus the table→cards shape, same convention as
 * /talleres/temporadas' and /talleres/reportes' loading.tsx (T7/T8).
 */
import { ContenedorDashboard, SkeletonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'

export default function LoadingMiRecorrido() {
  return (
    <ContenedorDashboard titulo="Mi Recorrido">
      {/* Tab bar shape */}
      <div className="inline-flex items-center gap-1 rounded-2xl bg-card/60 border border-border/30 p-1">
        <SkeletonSistema ancho="80px" alto="32px" className="rounded-xl" />
        <SkeletonSistema ancho="80px" alto="32px" className="rounded-xl" />
        <SkeletonSistema ancho="100px" alto="32px" className="rounded-xl" />
      </div>

      {/* Desktop — table shape */}
      <div className="hidden md:block mt-4">
        <TarjetaSistema className="p-0">
          <div className="divide-y divide-border">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4 p-4">
                <SkeletonSistema ancho="40%" alto="14px" />
                <SkeletonSistema ancho="20%" alto="12px" />
                <SkeletonSistema ancho="70px" alto="20px" className="rounded-full" />
              </div>
            ))}
          </div>
        </TarjetaSistema>
      </div>

      {/* Mobile — card shape */}
      <div className="md:hidden mt-4 space-y-3">
        {[...Array(3)].map((_, i) => (
          <TarjetaSistema key={i} variante="outlined" className="p-4">
            <SkeletonSistema ancho="60%" alto="14px" />
            <SkeletonSistema ancho="80%" alto="12px" className="mt-3" />
            <SkeletonSistema ancho="70px" alto="20px" className="mt-3 rounded-full" />
          </TarjetaSistema>
        ))}
      </div>
    </ContenedorDashboard>
  )
}
