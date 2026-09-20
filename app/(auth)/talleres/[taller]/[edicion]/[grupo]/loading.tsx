/**
 * T5 (odd/tasks/talleres-consolidar-pantallas.md) — loading skeleton for
 * /talleres/[taller]/[edicion]/[grupo]. Mirrors the real page's five
 * sections per docs/talleres-de-punta-a-punta.md §9's `loading.tsx`
 * pattern (imitate the real shape, not a spinner): cabecera, su gente,
 * clases, asistencia, reporte.
 */
import { ContenedorDashboard, SkeletonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'

export default function LoadingGrupoDetalle() {
  return (
    <ContenedorDashboard titulo="Grupo">
      <div className="space-y-6">
        {/* Cabecera */}
        <TarjetaSistema variante="outlined" className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <SkeletonSistema ancho="140px" alto="14px" />
              <SkeletonSistema ancho="60%" alto="12px" />
              <SkeletonSistema ancho="40%" alto="12px" />
            </div>
            <SkeletonSistema ancho="70px" alto="24px" className="rounded-full" />
          </div>
        </TarjetaSistema>

        {/* Su gente */}
        <div>
          <SkeletonSistema ancho="90px" alto="24px" className="mb-3" />
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
                <SkeletonSistema ancho="45%" alto="14px" />
                <SkeletonSistema ancho="60px" alto="20px" className="rounded-full" />
              </div>
            ))}
          </div>
        </div>

        {/* Clases */}
        <div>
          <SkeletonSistema ancho="70px" alto="24px" className="mb-3" />
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
                <SkeletonSistema ancho="30%" alto="14px" />
                <SkeletonSistema ancho="90px" alto="14px" />
              </div>
            ))}
          </div>
        </div>

        {/* Asistencia */}
        <div>
          <SkeletonSistema ancho="100px" alto="24px" className="mb-3" />
          <TarjetaSistema variante="outlined" className="p-4">
            <SkeletonSistema ancho="100%" alto="40px" className="rounded-xl" />
          </TarjetaSistema>
        </div>

        {/* Reporte */}
        <div>
          <SkeletonSistema ancho="90px" alto="24px" className="mb-3" />
          <TarjetaSistema variante="outlined" className="p-4">
            <SkeletonSistema ancho="100%" alto="60px" />
          </TarjetaSistema>
        </div>
      </div>
    </ContenedorDashboard>
  )
}
