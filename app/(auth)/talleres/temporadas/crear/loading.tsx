/**
 * T8 (odd/tasks/talleres-consolidar-pantallas.md) — loading skeleton for
 * /talleres/temporadas/crear. Mirrors the real form's shape: the data
 * section and the talleres checklist laid out by SeccionesSistema.
 */
import {
  CamposSistema,
  PaginaSistema,
  SeccionesSistema,
  SkeletonSistema,
  TarjetaSistema,
} from '@/components/ui/sistema-diseno'

export default function LoadingTemporadaCrear() {
  return (
    <PaginaSistema titulo="Crear Temporada">
      <SeccionesSistema>
        <TarjetaSistema variante="elevated" className="p-5">
          <SkeletonSistema ancho="80%" alto="14px" className="mb-4" />
          <CamposSistema>
            <SkeletonSistema ancho="100%" alto="44px" className="rounded-xl" />
            <SkeletonSistema ancho="100%" alto="44px" className="rounded-xl" />
            <SkeletonSistema ancho="100%" alto="44px" className="rounded-xl" />
            <SkeletonSistema ancho="100%" alto="44px" className="rounded-xl" />
          </CamposSistema>
        </TarjetaSistema>
        <TarjetaSistema variante="elevated" className="grid gap-2 p-5">
          <SkeletonSistema ancho="50%" alto="14px" />
          <SkeletonSistema ancho="100%" alto="44px" className="rounded-xl" />
          <SkeletonSistema ancho="100%" alto="44px" className="rounded-xl" />
        </TarjetaSistema>
      </SeccionesSistema>
      <div className="flex justify-end gap-2">
        <SkeletonSistema ancho="100px" alto="44px" className="rounded-xl" />
        <SkeletonSistema ancho="140px" alto="44px" className="rounded-xl" />
      </div>
    </PaginaSistema>
  )
}
