/**
 * Loading of /talleres/[taller]/avisos: the summary, the tabs and the notice
 * rows of design 15 as skeletons.
 */
import { PaginaSistema, SkeletonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'

export default function CargandoAvisos() {
  return (
    <PaginaSistema titulo="Avisos">
      <div role="status" aria-busy="true" className="grid gap-4">
        <span className="sr-only">Cargando</span>
        <SkeletonSistema ancho="18rem" alto="1rem" />
        <SkeletonSistema ancho="14rem" alto="2.25rem" className="rounded-xl" />
        <TarjetaSistema variante="outlined" className="grid gap-5 p-5">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="flex items-center gap-4">
              <SkeletonSistema ancho="2.75rem" alto="1.5rem" redondo />
              <div className="grid flex-1 gap-2">
                <SkeletonSistema ancho="40%" alto="0.875rem" />
                <SkeletonSistema ancho="70%" alto="0.75rem" />
              </div>
            </div>
          ))}
        </TarjetaSistema>
      </div>
    </PaginaSistema>
  )
}
