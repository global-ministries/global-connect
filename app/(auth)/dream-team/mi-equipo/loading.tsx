/**
 * Dream Team — loading skeleton for /dream-team/mi-equipo.
 *
 * Mirrors the real layout (components/dream-team/mi-equipo): the header with
 * the direccion name and search, a row of team cards and the people list card
 * with its filter pills and rows, per docs/sistema-diseno.md's `loading.tsx`
 * skeleton pattern.
 */
import { ContenedorDashboard, SkeletonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'

export default function LoadingMiEquipo() {
  return (
    <ContenedorDashboard titulo="Mi equipo">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <SkeletonSistema ancho="260px" alto="32px" />
          <SkeletonSistema ancho="320px" alto="16px" />
        </div>
        <SkeletonSistema ancho="288px" alto="44px" className="rounded-xl" />
      </div>

      <div className="flex gap-2 overflow-hidden md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <SkeletonSistema key={i} ancho="100%" alto="44px" className="min-w-32 rounded-full md:h-[148px] md:rounded-2xl" />
        ))}
      </div>

      <TarjetaSistema className="overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5">
          <div className="space-y-2">
            <SkeletonSistema ancho="180px" alto="20px" />
            <SkeletonSistema ancho="220px" alto="14px" />
          </div>
          <div className="flex gap-2">
            {[...Array(4)].map((_, i) => (
              <SkeletonSistema key={i} ancho="96px" alto="44px" className="rounded-full" />
            ))}
          </div>
        </div>
        <div className="divide-y divide-border">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 md:px-5">
              <SkeletonSistema ancho="40px" alto="40px" redondo />
              <div className="flex-1 space-y-2">
                <SkeletonSistema ancho="45%" alto="16px" />
                <SkeletonSistema ancho="30%" alto="12px" />
              </div>
              <SkeletonSistema ancho="90px" alto="24px" className="hidden rounded-full md:block" />
            </div>
          ))}
        </div>
      </TarjetaSistema>
    </ContenedorDashboard>
  )
}
