/**
 * T4 (odd/tasks/talleres-consolidar-pantallas.md) — loading skeleton for
 * /talleres/[taller]/[edicion]. Mirrors the real page's four sections per
 * docs/talleres-de-punta-a-punta.md §9's `loading.tsx` pattern (imitate the
 * real shape, not a spinner): the cabecera card, the inscritos table
 * shape, a grupos card, and the ventana card.
 */
import { ContenedorDashboard, SkeletonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'

export default function LoadingEdicionDetalle() {
  return (
    <ContenedorDashboard titulo="Edición">
      <div className="space-y-6">
        {/* Cabecera */}
        <TarjetaSistema variante="outlined" className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <SkeletonSistema ancho="160px" alto="14px" />
              <SkeletonSistema ancho="70%" alto="12px" />
            </div>
            <div className="flex flex-col items-end gap-2">
              <SkeletonSistema ancho="80px" alto="24px" className="rounded-full" />
              <SkeletonSistema ancho="140px" alto="36px" className="rounded-xl" />
            </div>
          </div>
        </TarjetaSistema>

        {/* Inscritos */}
        <div>
          <SkeletonSistema ancho="100px" alto="24px" className="mb-3" />
          <TarjetaSistema variante="outlined" className="p-0">
            <div className="divide-y divide-border">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-4 p-4">
                  <SkeletonSistema ancho="40%" alto="14px" />
                  <SkeletonSistema ancho="70px" alto="20px" className="rounded-full" />
                </div>
              ))}
            </div>
          </TarjetaSistema>
        </div>

        {/* Grupos */}
        <TarjetaSistema variante="outlined" className="p-4">
          <SkeletonSistema ancho="100px" alto="18px" className="mb-3" />
          <SkeletonSistema ancho="100%" alto="40px" className="rounded-xl" />
        </TarjetaSistema>

        {/* Ventana */}
        <div>
          <SkeletonSistema ancho="100px" alto="24px" className="mb-3" />
          <TarjetaSistema variante="outlined" className="p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="space-y-1">
                  <SkeletonSistema ancho="60%" alto="10px" />
                  <SkeletonSistema ancho="80%" alto="14px" />
                </div>
              ))}
            </div>
          </TarjetaSistema>
        </div>
      </div>
    </ContenedorDashboard>
  )
}
