/**
 * Dream Team — loading skeleton for /admin/dream-team/estructura.
 *
 * Mirrors estructura-client.tsx's real structure: one `TarjetaSistema`
 * holding several tree-row placeholders (chevron spacer + name + badges),
 * per docs/sistema-diseno.md's `loading.tsx` skeleton pattern.
 */
import { ContenedorDashboard, SkeletonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'

export default function LoadingEstructura() {
  return (
    <ContenedorDashboard titulo="Estructura">
      <TarjetaSistema className="p-0">
        <div className="divide-y divide-border px-3 sm:px-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-2 py-3" style={{ marginLeft: (i % 3) * 14 }}>
              <SkeletonSistema ancho="44px" alto="20px" />
              <div className="flex-1 space-y-2">
                <SkeletonSistema ancho={`${140 - (i % 3) * 20}px`} alto="16px" />
                <SkeletonSistema ancho="90px" alto="14px" />
              </div>
            </div>
          ))}
        </div>
      </TarjetaSistema>
    </ContenedorDashboard>
  )
}
