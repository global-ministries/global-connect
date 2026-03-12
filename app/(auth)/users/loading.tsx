import { ContenedorDashboard, TarjetaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'

export default function LoadingUsuarios() {
  return (
    <ContenedorDashboard titulo="Usuarios" descripcion="Cargando información...">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* Lista */}
      <div className="space-y-3 mt-4">
        {[...Array(6)].map((_, i) => (
          <TarjetaSistema key={i} className="p-4">
            <div className="flex items-center gap-4">
              <SkeletonSistema ancho="48px" alto="48px" redondo />
              <div className="flex-1 grid grid-cols-4 gap-4">
                <SkeletonSistema ancho="60%" alto="16px" />
                <SkeletonSistema ancho="80%" alto="16px" />
                <SkeletonSistema ancho="50%" alto="16px" />
                <SkeletonSistema ancho="30%" alto="16px" />
              </div>
              <SkeletonSistema ancho="80px" alto="32px" />
            </div>
          </TarjetaSistema>
        ))}
      </div>
    </ContenedorDashboard>
  )
}
