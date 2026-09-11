/**
 * Dream Team — loading skeleton for /dream-team/mi-equipo.
 *
 * Mirrors mi-equipo-client.tsx's real structure: the per-etapa counters row
 * and the branch tree (node row + its member rows), per
 * docs/sistema-diseno.md's `loading.tsx` skeleton pattern.
 */
import { ContenedorDashboard, SkeletonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'

export default function LoadingMiEquipo() {
  return (
    <ContenedorDashboard titulo="Mi equipo">
      <div className="flex flex-wrap gap-2">
        {[...Array(6)].map((_, i) => (
          <SkeletonSistema key={i} ancho="90px" alto="24px" className="rounded-full" />
        ))}
      </div>

      <TarjetaSistema className="p-0">
        <div className="divide-y divide-border px-3 sm:px-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="py-3">
              <div className="flex items-center gap-2">
                <SkeletonSistema ancho="44px" alto="20px" />
                <SkeletonSistema ancho="140px" alto="16px" />
              </div>
              <div className="ml-11 mt-2 space-y-2 border-l border-border pl-3">
                <SkeletonSistema ancho="100%" alto="14px" />
                <SkeletonSistema ancho="80%" alto="14px" />
              </div>
            </div>
          ))}
        </div>
      </TarjetaSistema>
    </ContenedorDashboard>
  )
}
