/**
 * R3k (odd/tasks/talleres-rediseno.md, S1) — loading of
 * /talleres/[taller]/configuracion: the summary line and the four section
 * cards (Inscripción, Ediciones, Clases y certificado, Cadencia y duración)
 * as skeletons, then the save footer.
 */
import { PaginaSistema, SeccionesSistema, SkeletonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'

export default function CargandoConfiguracionTaller() {
  return (
    <PaginaSistema titulo="Configuración">
      <div role="status" aria-busy="true" className="grid gap-6">
        <span className="sr-only">Cargando</span>
        <SkeletonSistema ancho="min(460px, 90%)" alto="14px" />
        <SeccionesSistema>
          {[...Array(4)].map((_, i) => (
            <TarjetaSistema key={i} className="grid gap-4 p-4 sm:p-5">
              <SkeletonSistema ancho="140px" alto="18px" />
              <SkeletonSistema ancho="70%" alto="12px" />
              <div className="grid gap-4 sm:grid-cols-2">
                <SkeletonSistema alto="2.75rem" />
                <SkeletonSistema alto="2.75rem" />
              </div>
            </TarjetaSistema>
          ))}
        </SeccionesSistema>
        <div className="flex justify-end">
          <SkeletonSistema ancho="190px" alto="2.75rem" className="rounded-xl" />
        </div>
      </div>
    </PaginaSistema>
  )
}
