/**
 * Personas — loading skeleton for /admin/personas/fusionar: the frame of the
 * first step (the two ficha searches).
 */
import { PaginaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'

export default function LoadingFusionarPersonas() {
  return (
    <PaginaSistema>
      <div role="status" aria-busy="true" className="grid gap-6">
        <span className="sr-only">Cargando</span>
        <SkeletonSistema alto="16px" ancho="320px" />
        <SkeletonSistema alto="24px" ancho="220px" />
        <div className="grid gap-6 md:grid-cols-2">
          <SkeletonSistema alto="44px" className="rounded-xl" />
          <SkeletonSistema alto="44px" className="rounded-xl" />
        </div>
      </div>
    </PaginaSistema>
  )
}
