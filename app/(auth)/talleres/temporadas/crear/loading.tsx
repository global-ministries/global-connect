/**
 * T8 (odd/tasks/talleres-consolidar-pantallas.md) — loading skeleton for
 * /talleres/temporadas/crear. Mirrors the real form's field shape.
 */
import { PaginaSistema, SkeletonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'

export default function LoadingTemporadaCrear() {
  return (
    <PaginaSistema titulo="Crear Temporada" ancho="form">
      <TarjetaSistema variante="elevated" className="p-5">
        <SkeletonSistema ancho="80%" alto="14px" className="mb-4" />
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonSistema ancho="100%" alto="44px" className="rounded-xl md:col-span-2" />
          <SkeletonSistema ancho="100%" alto="44px" className="rounded-xl md:col-span-2" />
          <SkeletonSistema ancho="100%" alto="88px" className="rounded-xl md:col-span-2" />
          <SkeletonSistema ancho="100%" alto="44px" className="rounded-xl" />
          <SkeletonSistema ancho="100%" alto="44px" className="rounded-xl" />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <SkeletonSistema ancho="100px" alto="44px" className="rounded-xl" />
          <SkeletonSistema ancho="140px" alto="44px" className="rounded-xl" />
        </div>
      </TarjetaSistema>
    </PaginaSistema>
  )
}
