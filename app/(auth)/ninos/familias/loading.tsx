/**
 * Niños — loading skeleton for /ninos/familias, following the app's loading.tsx
 * pattern (see app/(auth)/dream-team/mi-equipo/loading.tsx): the header,
 * the service pickers and a content card.
 */
import { ContenedorDashboard, SkeletonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'

export default function Loading() {
  return (
    <ContenedorDashboard titulo="Familias">
      <div className="space-y-2">
        <SkeletonSistema ancho="200px" alto="32px" />
        <SkeletonSistema ancho="280px" alto="16px" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:max-w-2xl">
        <SkeletonSistema alto="44px" className="rounded-xl" />
        <SkeletonSistema alto="44px" className="rounded-xl" />
      </div>
      <TarjetaSistema className="space-y-3 p-4">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonSistema key={i} alto="40px" />
        ))}
      </TarjetaSistema>
    </ContenedorDashboard>
  )
}
