/**
 * T6 (odd/tasks/talleres-consolidar-pantallas.md) — loading skeleton for
 * /talleres/pendientes. Mirrors the real page's two sections per docs/
 * talleres-de-punta-a-punta.md §9's `loading.tsx` pattern (imitate the
 * real shape, not a spinner): the inscripciones table shape and the
 * retiros card list.
 */
import { ContenedorDashboard, SkeletonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'

export default function LoadingPendientes() {
  return (
    <ContenedorDashboard titulo="Pendientes">
      <div className="space-y-6">
        {/* Inscripciones por aprobar */}
        <div>
          <SkeletonSistema ancho="180px" alto="24px" className="mb-3" />
          <TarjetaSistema variante="outlined" className="p-0">
            <div className="divide-y divide-border">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-4 p-4">
                  <SkeletonSistema ancho="40%" alto="14px" />
                  <SkeletonSistema ancho="30%" alto="12px" />
                  <SkeletonSistema ancho="70px" alto="20px" className="rounded-full" />
                </div>
              ))}
            </div>
          </TarjetaSistema>
        </div>

        {/* Retiros por resolver */}
        <div>
          <SkeletonSistema ancho="160px" alto="24px" className="mb-3" />
          <div className="grid gap-3">
            {[...Array(2)].map((_, i) => (
              <TarjetaSistema key={i} variante="outlined" className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <SkeletonSistema ancho="50%" alto="14px" />
                  <SkeletonSistema ancho="70px" alto="20px" className="rounded-full" />
                </div>
                <SkeletonSistema ancho="80%" alto="12px" className="mt-3" />
              </TarjetaSistema>
            ))}
          </div>
        </div>
      </div>
    </ContenedorDashboard>
  )
}
