/**
 * Loading skeleton for /talleres/[taller]/[edicion]. R3f
 * (odd/tasks/talleres-rediseno.md): mirrors the v2 page (artboards
 * design/talleres-reserva/12 and design/talleres-interior/24) — the hero
 * with its summary, the tabs, the attention metrics and the list rows —
 * so nothing jumps when the data arrives.
 */
import { PaginaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'

export default function LoadingEdicionDetalle() {
  return (
    <PaginaSistema>
      <div role="status" aria-label="Cargando la edición" className="grid gap-6">
        {/* Hero */}
        <div className="grid gap-2">
          <SkeletonSistema ancho="min(420px,80%)" alto="28px" />
          <SkeletonSistema ancho="min(560px,95%)" alto="16px" />
          <SkeletonSistema ancho="min(320px,70%)" alto="14px" />
        </div>

        {/* Tabs */}
        <SkeletonSistema ancho="220px" alto="40px" className="rounded-xl" />

        {/* Necesita atención */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[...Array(3)].map((_, i) => (
            <SkeletonSistema key={i} ancho="100%" alto="88px" className="rounded-2xl" />
          ))}
        </div>

        {/* Inscritas */}
        <div className="overflow-hidden rounded-2xl bg-card md:border md:border-border/60">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-b-0">
              <SkeletonSistema ancho="40px" alto="40px" className="shrink-0 rounded-full" />
              <div className="grid flex-1 gap-1.5">
                <SkeletonSistema ancho="45%" alto="14px" />
                <SkeletonSistema ancho="30%" alto="12px" />
              </div>
              <SkeletonSistema ancho="80px" alto="20px" className="rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </PaginaSistema>
  )
}
