/**
 * Loading skeleton for /mis-servicios/[planId]: the frame of
 * components/mis-servicios/detalle-servicio-client.tsx (series, date, state,
 * «Tu servicio», «Quiénes sirven contigo»).
 */
import { SkeletonLista } from '@/components/ui/estado-vacio-sistema'
import { PaginaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'

export default function LoadingMiServicio() {
  return (
    <PaginaSistema>
      <div className="space-y-2">
        <SkeletonSistema ancho="220px" alto="14px" />
        <SkeletonSistema ancho="280px" alto="30px" className="max-w-full" />
        <SkeletonSistema ancho="180px" alto="18px" />
      </div>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <SkeletonSistema ancho="120px" alto="14px" />
          <div className="overflow-hidden rounded-2xl bg-card md:border md:border-border">
            <SkeletonLista filas={4} />
          </div>
        </div>
        <div className="space-y-2">
          <SkeletonSistema ancho="160px" alto="14px" />
          <div className="overflow-hidden rounded-2xl bg-card md:border md:border-border">
            <SkeletonLista filas={5} />
          </div>
        </div>
      </div>
    </PaginaSistema>
  )
}
