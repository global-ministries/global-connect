/**
 * Loading of /talleres/reservar: the same frame (header, title, cards) with
 * skeletons, so nothing jumps when the catalog arrives.
 */
import { EncabezadoPublico } from '@/components/talleres/reserva/encabezado-publico'
import { SegunIncrustado } from '@/components/talleres/reserva/incrustado'
import { SkeletonSistema } from '@/components/ui/sistema-diseno'

/** Embedded (T6): only a card-sized skeleton, no header. */
const INCRUSTADO = (
  <div role="status" aria-busy="true" className="grid gap-3 rounded-2xl border border-border bg-card p-4">
    <span className="sr-only">Cargando talleres</span>
    <SkeletonSistema ancho="10rem" alto="0.75rem" />
    <SkeletonSistema ancho="14rem" alto="1.5rem" />
    <SkeletonSistema alto="5rem" className="rounded-2xl" />
  </div>
)

export default function CargandoCatalogo() {
  return <SegunIncrustado incrustado={INCRUSTADO} normal={<Normal />} />
}

function Normal() {
  return (
    <div className="min-h-dvh bg-background">
      <EncabezadoPublico migas={[{ etiqueta: 'Grupos de Corto Plazo' }]} />
      <div role="status" aria-busy="true" className="grid gap-8 px-4 pt-3 pb-10 sm:px-6 lg:px-12 lg:pt-8">
        <span className="sr-only">Cargando talleres</span>
        <div className="grid gap-3 px-1">
          <SkeletonSistema ancho="16rem" alto="2rem" />
          <SkeletonSistema ancho="min(28rem, 100%)" alto="1rem" />
        </div>
        <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonSistema key={i} alto="8.5rem" className="rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  )
}
