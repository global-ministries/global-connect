/**
 * T3 (odd/tasks/talleres-consolidar-pantallas.md) — loading skeleton for
 * /talleres/[taller]. Mirrors the real page's shape per docs/talleres-de-
 * punta-a-punta.md §9's `loading.tsx` pattern: the info card (slug line +
 * estado badge), the "Ediciones" heading with a few edición cards, and two
 * placeholder rows for where the abrir-edición / equipo controls render —
 * not a spinner.
 */
import { ContenedorDashboard, SkeletonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'

export default function LoadingTallerDetalle() {
  return (
    <ContenedorDashboard titulo="Taller">
      <div className="space-y-6">
        <TarjetaSistema variante="outlined" className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <SkeletonSistema ancho="140px" alto="14px" />
              <SkeletonSistema ancho="60%" alto="14px" />
            </div>
            <SkeletonSistema ancho="70px" alto="24px" className="rounded-full" />
          </div>
        </TarjetaSistema>

        <div>
          <SkeletonSistema ancho="100px" alto="24px" className="mb-3" />
          <div className="grid gap-3">
            {[...Array(2)].map((_, i) => (
              <TarjetaSistema key={i} variante="elevated" className="p-4">
                <div className="flex items-center gap-2">
                  <SkeletonSistema ancho="180px" alto="16px" />
                  <SkeletonSistema ancho="70px" alto="20px" className="rounded-full" />
                </div>
                <SkeletonSistema ancho="30%" alto="12px" className="mt-2" />
              </TarjetaSistema>
            ))}
          </div>
        </div>

        <SkeletonSistema ancho="180px" alto="40px" className="rounded-xl" />
        <SkeletonSistema ancho="180px" alto="40px" className="rounded-xl" />
      </div>
    </ContenedorDashboard>
  )
}
