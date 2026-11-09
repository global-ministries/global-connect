/**
 * Inicio — loading skeleton. Keeps the frame of the home
 * (components/inicio/pantalla-inicio.tsx): the date and greeting, the summary
 * line and two sections side by side on desktop, one column on phone
 * (docs/design-system/patterns.md#empty-and-loading-states). Which sections
 * appear is not known yet, so they are generic blocks.
 */
import { MigasInicio } from '@/components/inicio/partes-inicio'
import { SkeletonLista } from '@/components/ui/estado-vacio-sistema'
import { PaginaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'

export default function LoadingInicio() {
  return (
    <PaginaSistema breadcrumbs={<MigasInicio />}>
      <div className="grid grid-cols-1 gap-[22px] *:min-w-0 md:grid-cols-12 md:gap-x-6 md:gap-y-7">
        <div className="space-y-2 px-1 md:col-span-12 md:px-0">
          <SkeletonSistema ancho="160px" alto="14px" />
          <SkeletonSistema ancho="220px" alto="32px" />
          <SkeletonSistema ancho="280px" alto="18px" className="max-w-full" />
        </div>

        <div className="space-y-2 md:col-span-12 lg:col-span-7">
          <SkeletonSistema ancho="120px" alto="12px" className="mx-1 my-4" />
          <SkeletonSistema alto="220px" className="rounded-2xl" />
        </div>

        <div className="space-y-2 md:col-span-12 lg:col-span-5">
          <SkeletonSistema ancho="120px" alto="12px" className="mx-1 my-4" />
          <div className="min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card">
            <SkeletonLista filas={3} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 md:col-span-12 md:gap-3 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <SkeletonSistema key={i} alto="96px" className="rounded-2xl" />
          ))}
        </div>
      </div>
    </PaginaSistema>
  )
}
