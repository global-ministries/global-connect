import { ContenedorDashboard, TarjetaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'

export default function LoadingReporteSemanal() {
  return (
    <ContenedorDashboard titulo="Asistencia Semanal" descripcion="Cargando reporte...">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TarjetaSistema className="p-6">
          <SkeletonSistema ancho="40%" alto="20px" />
          <div className="mt-4 space-y-2">
            {[...Array(6)].map((_, i) => (
              <SkeletonSistema key={i} ancho="100%" alto="14px" />
            ))}
          </div>
        </TarjetaSistema>
        <TarjetaSistema className="p-6">
          <SkeletonSistema ancho="60%" alto="20px" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[...Array(6)].map((_, i) => (
              <SkeletonSistema key={i} ancho="100%" alto="80px" />
            ))}
          </div>
        </TarjetaSistema>
      </div>
    </ContenedorDashboard>
  )
}
