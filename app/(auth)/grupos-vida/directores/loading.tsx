/**
 * Grupos de Vida — loading skeleton for /grupos-vida/directores.
 *
 * Mirrors the real structure (components/grupos-vida/directores/): the "Por
 * ordenar" strip, the two tabs and the general director cards, per
 * docs/sistema-diseno.md's `loading.tsx` skeleton pattern.
 */
import { ContenedorDashboard, SkeletonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'

export default function LoadingDirectores() {
  return (
    <ContenedorDashboard titulo="Directores">
      <SkeletonSistema ancho="320px" alto="16px" />

      <SkeletonSistema alto="120px" className="rounded-2xl" />

      <div className="flex gap-2 border-b border-border pb-2">
        <SkeletonSistema ancho="180px" alto="32px" />
        <SkeletonSistema ancho="170px" alto="32px" />
      </div>

      {[...Array(3)].map((_, i) => (
        <TarjetaSistema key={i} variante="outlined" className="space-y-4">
          <div className="flex items-center gap-3.5">
            <SkeletonSistema ancho="44px" alto="44px" className="rounded-full" />
            <div className="space-y-2">
              <SkeletonSistema ancho="200px" alto="18px" />
              <SkeletonSistema ancho="260px" alto="14px" />
            </div>
          </div>
          <SkeletonSistema alto="72px" className="rounded-xl" />
        </TarjetaSistema>
      ))}
    </ContenedorDashboard>
  )
}
