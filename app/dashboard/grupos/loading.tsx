import { ContenedorDashboard, TarjetaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'

export default function LoadingGrupos() {
  return (
    <ContenedorDashboard titulo="Grupos" descripcion="Cargando información...">
      {/* KPIs */}
      <div className="hidden md:grid md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <TarjetaSistema key={i} className="p-6">
            <div className="flex items-center gap-4">
              <SkeletonSistema ancho="48px" alto="48px" redondo />
              <div className="space-y-2 flex-1">
                <SkeletonSistema ancho="100px" alto="18px" />
                <SkeletonSistema ancho="140px" alto="14px" />
              </div>
            </div>
          </TarjetaSistema>
        ))}
      </div>

      {/* Lista/Table */}
      <TarjetaSistema className="p-6">
        <div className="space-y-4">
          <SkeletonSistema ancho="180px" alto="20px" />
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 border border-gray-100 rounded-lg">
              <SkeletonSistema ancho="64px" alto="40px" />
              <div className="flex-1 grid grid-cols-4 gap-4">
                <SkeletonSistema ancho="100%" alto="16px" />
                <SkeletonSistema ancho="80%" alto="16px" />
                <SkeletonSistema ancho="60%" alto="16px" />
                <SkeletonSistema ancho="40%" alto="16px" />
              </div>
              <SkeletonSistema ancho="100px" alto="32px" />
            </div>
          ))}
        </div>
      </TarjetaSistema>
    </ContenedorDashboard>
  )
}
