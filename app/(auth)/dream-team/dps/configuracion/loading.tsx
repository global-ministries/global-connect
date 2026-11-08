/**
 * DPS — loading skeleton for /dream-team/dps/configuracion. Keeps the frame
 * of the real screen (components/dream-team/dps/configuracion-client.tsx):
 * the title and its three section cards
 * (docs/design-system/patterns.md#empty-and-loading-states).
 */
import { PaginaSistema, SeccionesSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'

export default function LoadingDpsConfiguracion() {
  return (
    <PaginaSistema>
      <div className="space-y-2">
        <h1 className="text-[28px] font-bold leading-[1.1] tracking-[-0.03em] md:text-2xl md:font-[650] md:tracking-[-0.02em]">Configuración de DPS</h1>
        <SkeletonSistema ancho="320px" alto="18px" className="max-w-full" />
      </div>
      <SeccionesSistema>
        <SkeletonSistema alto="280px" className="rounded-2xl" />
        <SkeletonSistema alto="280px" className="rounded-2xl" />
      </SeccionesSistema>
      <SkeletonSistema alto="240px" className="rounded-2xl" />
    </PaginaSistema>
  )
}
