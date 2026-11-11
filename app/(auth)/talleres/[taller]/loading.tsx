/**
 * T3 (odd/tasks/talleres-consolidar-pantallas.md) — loading skeleton for
 * /talleres/[taller], not a spinner (docs/talleres-de-punta-a-punta.md §9).
 *
 * R3d (odd/tasks/talleres-rediseno.md, S1) — mirrors the v2 page (artboard
 * design/talleres-interior/22): the title block (nombre, estado, summary and
 * meta lines), then the two columns — Ediciones (segmented control over the
 * list rows) and the side sections (plantilla de clases, equipo, página
 * pública).
 *
 * R3k (L10) — the configuration is its own view now, and the side column is
 * compact: the main column adds the plantilla de grupos under Ediciones and
 * the side sections are short cards.
 */
import { PaginaSistema, SkeletonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { SkeletonLista } from '@/components/ui/estado-vacio-sistema'

export default function LoadingTallerDetalle() {
  return (
    <PaginaSistema titulo="Taller">
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <SkeletonSistema ancho="220px" alto="24px" />
          <SkeletonSistema ancho="70px" alto="16px" />
        </div>
        <SkeletonSistema ancho="min(420px, 90%)" alto="14px" />
        <SkeletonSistema ancho="min(300px, 70%)" alto="12px" />
      </div>

      <div className="grid min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
        <div className="grid min-w-0 gap-3">
          <div className="flex items-center justify-between gap-3">
            <SkeletonSistema ancho="110px" alto="22px" />
            <SkeletonSistema ancho="260px" alto="36px" className="rounded-xl" />
          </div>
          <div className="overflow-hidden rounded-2xl bg-card md:border md:border-border/60">
            <SkeletonLista filas={3} />
          </div>
          <div className="mt-5 flex items-center justify-between gap-3">
            <SkeletonSistema ancho="170px" alto="22px" />
            <SkeletonSistema ancho="80px" alto="36px" className="rounded-xl" />
          </div>
          <TarjetaSistema className="grid gap-3 p-4">
            <SkeletonSistema ancho="40%" alto="16px" />
            <SkeletonSistema ancho="60%" alto="12px" />
          </TarjetaSistema>
        </div>

        <div className="grid min-w-0 gap-8">
          {[4, 2, 1].map((lineas, i) => (
            <div key={i} className="grid gap-3">
              <SkeletonSistema ancho="150px" alto="20px" />
              <TarjetaSistema className="grid gap-3 p-4">
                {[...Array(lineas)].map((__, j) => (
                  <SkeletonSistema key={j} ancho={j % 2 === 0 ? '75%' : '60%'} alto="14px" />
                ))}
              </TarjetaSistema>
            </div>
          ))}
        </div>
      </div>
    </PaginaSistema>
  )
}
