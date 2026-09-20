/**
 * T7 (odd/tasks/talleres-consolidar-pantallas.md) — loading skeleton for
 * /talleres/reportes. Mirrors the real page's table→cards shape (docs/
 * talleres-de-punta-a-punta.md §9's loading.tsx pattern: imitate the
 * real shape, not a spinner).
 */
import { ContenedorDashboard, SkeletonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'

export default function LoadingReportes() {
  return (
    <ContenedorDashboard titulo="Reportes">
      {/* Desktop — table shape */}
      <div className="hidden md:block">
        <TarjetaSistema className="p-0">
          <div className="divide-y divide-border">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4 p-4">
                <SkeletonSistema ancho="40%" alto="14px" />
                <SkeletonSistema ancho="70px" alto="20px" className="rounded-full" />
                <SkeletonSistema ancho="20%" alto="12px" />
              </div>
            ))}
          </div>
        </TarjetaSistema>
      </div>

      {/* Mobile — card shape */}
      <div className="md:hidden space-y-3">
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
