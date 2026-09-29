/**
 * Dream Team — loading skeleton for /admin/dream-team/servidores.
 *
 * Mirrors the real structure (components/dream-team/servidores/): the summary
 * line, the etapa counters, the filter bar and the table, per
 * docs/sistema-diseno.md's `loading.tsx` skeleton pattern.
 */
import { ContenedorDashboard, SkeletonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'

export default function LoadingServidores() {
  return (
    <ContenedorDashboard titulo="Servidores">
      <SkeletonSistema ancho="180px" alto="16px" />

      <div className="flex flex-wrap gap-2">
        {[...Array(7)].map((_, i) => (
          <SkeletonSistema key={i} ancho="96px" alto="44px" className="rounded-full" />
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]">
        <SkeletonSistema alto="44px" />
        <SkeletonSistema alto="44px" className="hidden md:block" />
        <SkeletonSistema alto="44px" className="hidden md:block" />
        <SkeletonSistema alto="44px" className="hidden md:block" />
        <SkeletonSistema alto="44px" className="hidden md:block" />
      </div>

      <TarjetaSistema className="p-0">
        <div className="divide-y divide-border">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <SkeletonSistema ancho="40px" alto="40px" className="rounded-full" />
              <SkeletonSistema ancho="160px" alto="16px" />
              <SkeletonSistema ancho="140px" alto="16px" />
              <SkeletonSistema ancho="80px" alto="20px" className="rounded-full" />
              <SkeletonSistema ancho="70px" alto="20px" className="rounded-full" />
            </div>
          ))}
        </div>
      </TarjetaSistema>
    </ContenedorDashboard>
  )
}
