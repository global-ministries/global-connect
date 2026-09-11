/**
 * Dream Team — loading skeleton for /admin/dream-team/servidores.
 *
 * Mirrors servidores-client.tsx's real structure: the per-etapa counters
 * row, the search + filters row, and the desktop table, per
 * docs/sistema-diseno.md's `loading.tsx` skeleton pattern.
 */
import { ContenedorDashboard, SkeletonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'

export default function LoadingServidores() {
  return (
    <ContenedorDashboard titulo="Servidores">
      <div className="flex flex-wrap gap-2">
        {[...Array(6)].map((_, i) => (
          <SkeletonSistema key={i} ancho="90px" alto="24px" className="rounded-full" />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SkeletonSistema ancho="240px" alto="44px" />
        <SkeletonSistema ancho="96px" alto="44px" />
      </div>

      <TarjetaSistema className="p-0">
        <div className="divide-y divide-border">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <SkeletonSistema ancho="120px" alto="16px" />
              <SkeletonSistema ancho="100px" alto="16px" />
              <SkeletonSistema ancho="80px" alto="16px" />
              <SkeletonSistema ancho="70px" alto="16px" className="rounded-full" />
              <SkeletonSistema ancho="90px" alto="32px" />
            </div>
          ))}
        </div>
      </TarjetaSistema>
    </ContenedorDashboard>
  )
}
