/**
 * Loading skeleton for /mis-servicios/fechas: the frame of
 * components/mis-servicios/fechas-bloqueadas-client.tsx (title, summary and
 * the list of dates).
 */
import { SkeletonLista } from '@/components/ui/estado-vacio-sistema'
import { PaginaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'

export default function LoadingFechasBloqueadas() {
  return (
    <PaginaSistema>
      <div className="space-y-2">
        <h1 className="text-[28px] font-bold leading-[1.1] tracking-[-0.03em] md:text-2xl md:font-[650] md:tracking-[-0.02em]">Fechas que no puedo servir</h1>
        <SkeletonSistema ancho="300px" alto="18px" className="max-w-full" />
      </div>
      <div className="overflow-hidden rounded-2xl bg-card md:border md:border-border">
        <SkeletonLista filas={3} />
      </div>
    </PaginaSistema>
  )
}
