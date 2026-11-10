/**
 * Loading of /talleres/[taller]/compartir: the two columns of design 08
 * (link and QR, embed code; preview) as skeletons.
 */
import { PaginaSistema, SkeletonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'

export default function CargandoCompartir() {
  return (
    <PaginaSistema titulo="Compartir">
      <div role="status" aria-busy="true" className="grid items-start gap-6 xl:grid-cols-2">
        <span className="sr-only">Cargando</span>
        <div className="grid gap-6">
          <TarjetaSistema variante="outlined" className="grid gap-4 p-5">
            <SkeletonSistema ancho="10rem" alto="1rem" />
            <SkeletonSistema alto="2.75rem" />
            <SkeletonSistema ancho="7rem" alto="7rem" className="rounded-xl" />
          </TarjetaSistema>
          <TarjetaSistema variante="outlined" className="grid gap-4 p-5">
            <SkeletonSistema ancho="12rem" alto="1rem" />
            <SkeletonSistema alto="2.75rem" />
            <SkeletonSistema alto="6rem" className="rounded-xl" />
          </TarjetaSistema>
        </div>
        <SkeletonSistema alto="28rem" className="rounded-2xl" />
      </div>
    </PaginaSistema>
  )
}
