import { PaginaSistema, TarjetaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'

/** Mirrors the /users layout (KPI tiles, search bar, rows) so nothing jumps when data arrives. */
export default function LoadingUsuarios() {
  return (
    <PaginaSistema titulo="Usuarios">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <TarjetaSistema key={i} className="p-4">
            <div className="flex items-center gap-3">
              <SkeletonSistema ancho="48px" alto="48px" />
              <div className="space-y-2 flex-1">
                <SkeletonSistema ancho="100px" alto="18px" />
                <SkeletonSistema ancho="140px" alto="14px" />
              </div>
            </div>
          </TarjetaSistema>
        ))}
      </div>

      {/* Búsqueda y lista */}
      <div className="space-y-3">
        <SkeletonSistema ancho="100%" alto="44px" />
        {[...Array(6)].map((_, i) => (
          <TarjetaSistema key={i} className="p-4">
            <div className="flex items-center gap-4">
              <SkeletonSistema ancho="48px" alto="48px" redondo />
              <div className="flex-1 min-w-0 grid grid-cols-1 gap-2 md:grid-cols-4 md:gap-4">
                <SkeletonSistema ancho="60%" alto="16px" />
                <SkeletonSistema ancho="80%" alto="16px" />
                <SkeletonSistema ancho="50%" alto="16px" className="hidden md:block" />
                <SkeletonSistema ancho="30%" alto="16px" className="hidden md:block" />
              </div>
            </div>
          </TarjetaSistema>
        ))}
      </div>
    </PaginaSistema>
  )
}
