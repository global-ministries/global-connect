/**
 * DPS — loading skeleton for /dps/asistencia. Keeps the frame of
 * the real screen (components/dps/asistencia-client.tsx): the
 * plan header with its progress bar, the filter and the list
 * (docs/design-system/patterns.md#empty-and-loading-states).
 */
import { PaginaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'
import { SkeletonLista } from '@/components/ui/estado-vacio-sistema'

export default function LoadingDpsAsistencia() {
  return (
    <PaginaSistema>
      <div className="space-y-2">
        <SkeletonSistema ancho="200px" alto="14px" />
        <h1 className="text-[28px] font-bold leading-[1.1] tracking-[-0.03em] md:text-2xl md:font-[650] md:tracking-[-0.02em]">Asistencia</h1>
        <SkeletonSistema ancho="300px" alto="18px" className="max-w-full" />
        <SkeletonSistema alto="4px" className="rounded-full" />
      </div>

      <SkeletonSistema alto="44px" className="rounded-xl sm:max-w-sm" />

      <div className="-mx-4 min-w-0 overflow-hidden border-y border-border bg-card sm:-mx-6 md:mx-0 md:rounded-md md:border">
        <SkeletonLista />
      </div>
    </PaginaSistema>
  )
}
