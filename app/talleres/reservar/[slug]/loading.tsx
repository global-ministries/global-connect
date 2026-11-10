/**
 * Loading of /talleres/reservar/<slug>: header, hero, horarios and the
 * reserve card as skeletons.
 */
import { EncabezadoPublico } from '@/components/talleres/reserva/encabezado-publico'
import { SkeletonSistema } from '@/components/ui/sistema-diseno'

export default function CargandoTaller() {
  return (
    <div className="min-h-dvh bg-background">
      <EncabezadoPublico migas={[{ etiqueta: 'Grupos de Corto Plazo', href: '/talleres/reservar' }]} atras={{ etiqueta: 'Talleres', href: '/talleres/reservar' }} />
      <div role="status" aria-busy="true" className="grid items-start gap-8 px-4 pt-4 pb-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12 lg:px-12 lg:pt-8">
        <span className="sr-only">Cargando el taller</span>
        <div className="grid gap-6">
          <div className="grid gap-3">
            <SkeletonSistema ancho="12rem" alto="0.75rem" />
            <SkeletonSistema ancho="14rem" alto="2rem" />
            <SkeletonSistema ancho="min(36rem, 100%)" alto="1rem" />
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonSistema key={i} alto="4rem" className="rounded-2xl" />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <SkeletonSistema key={i} alto="8rem" className="rounded-2xl" />
            ))}
          </div>
        </div>
        <SkeletonSistema alto="16rem" className="hidden rounded-2xl lg:block" />
      </div>
    </div>
  )
}
