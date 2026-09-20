/**
 * T8 (odd/tasks/talleres-consolidar-pantallas.md) — loading skeleton for
 * /talleres/temporadas/[id]. Mirrors the real page's shape: a header card
 * (slug/fechas/estado) plus the estado-transitions + talleres-membership
 * card below it.
 */
import { ContenedorDashboard, SkeletonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'

export default function LoadingTemporadaDetalle() {
  return (
    <ContenedorDashboard titulo="Temporada">
      <TarjetaSistema variante="outlined" className="mb-4 p-4">
        <SkeletonSistema ancho="30%" alto="14px" />
        <SkeletonSistema ancho="60%" alto="12px" className="mt-3" />
        <SkeletonSistema ancho="70px" alto="20px" className="mt-3 rounded-full" />
      </TarjetaSistema>

      <TarjetaSistema variante="outlined" className="mb-4 p-4">
        <SkeletonSistema ancho="20%" alto="14px" />
        <div className="mt-3 flex gap-2">
          <SkeletonSistema ancho="140px" alto="44px" className="rounded-xl" />
          <SkeletonSistema ancho="100px" alto="44px" className="rounded-xl" />
        </div>
      </TarjetaSistema>

      <TarjetaSistema variante="elevated" className="p-4">
        <SkeletonSistema ancho="40%" alto="14px" />
        <div className="mt-3 space-y-2">
          {[...Array(4)].map((_, i) => (
            <SkeletonSistema key={i} ancho="100%" alto="44px" className="rounded" />
          ))}
        </div>
      </TarjetaSistema>
    </ContenedorDashboard>
  )
}
