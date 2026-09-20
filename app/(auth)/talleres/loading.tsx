/**
 * T2 (odd/tasks/talleres-consolidar-pantallas.md) — loading skeleton for
 * /talleres. Mirrors CatalogoTalleresClient's real structure per
 * docs/talleres-de-punta-a-punta.md §9's `loading.tsx` pattern: a
 * "Mis grupos" row of cards, the catálogo header with its filter tabs,
 * and taller cards with a nested ediciones list — not a spinner.
 */
import { ContenedorDashboard, SkeletonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'

export default function LoadingTalleres() {
  return (
    <ContenedorDashboard titulo="Talleres">
      <div className="space-y-6">
        <div>
          <SkeletonSistema ancho="120px" alto="24px" className="mb-3" />
          <div className="grid gap-3 md:grid-cols-2">
            {[...Array(2)].map((_, i) => (
              <TarjetaSistema key={i} variante="elevated" className="p-4">
                <SkeletonSistema ancho="60%" alto="16px" />
                <SkeletonSistema ancho="80%" alto="12px" className="mt-2" />
                <SkeletonSistema ancho="50%" alto="12px" className="mt-2" />
              </TarjetaSistema>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <SkeletonSistema ancho="100px" alto="24px" />
            <SkeletonSistema ancho="140px" alto="36px" className="rounded-xl" />
          </div>
          <div className="grid gap-3">
            {[...Array(3)].map((_, i) => (
              <TarjetaSistema key={i} variante="outlined" className="p-4">
                <div className="flex items-center gap-2">
                  <SkeletonSistema ancho="200px" alto="16px" />
                  <SkeletonSistema ancho="70px" alto="20px" className="rounded-full" />
                </div>
                <SkeletonSistema ancho="40%" alto="12px" className="mt-2" />
                <div className="mt-2 space-y-1.5 border-l border-border pl-3">
                  <SkeletonSistema ancho="100%" alto="14px" />
                  <SkeletonSistema ancho="90%" alto="14px" />
                </div>
              </TarjetaSistema>
            ))}
          </div>
        </div>
      </div>
    </ContenedorDashboard>
  )
}
