/**
 * T9 (odd/tasks/talleres-consolidar-pantallas.md) — loading skeleton for
 * /talleres/mi-recorrido/certificados/[id]. Mirrors the real page's two
 * elevated cards (certificate, verification) laid out by SeccionesSistema
 * (docs/talleres-de-punta-a-punta.md §9's loading.tsx pattern: imitate the
 * real shape, not a spinner).
 */
import { PaginaSistema, SeccionesSistema, SkeletonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'

export default function LoadingCertificadoDetail() {
  return (
    <PaginaSistema titulo="Certificado">
      <SeccionesSistema>
        <TarjetaSistema variante="elevated" className="p-6">
          <SkeletonSistema ancho="60%" alto="20px" />
          <SkeletonSistema ancho="40%" alto="14px" className="mt-3" />
          <SkeletonSistema ancho="70px" alto="20px" className="mt-4 rounded-full" />
        </TarjetaSistema>
        <TarjetaSistema variante="elevated" className="p-6">
          <SkeletonSistema ancho="100%" alto="56px" />
          <SkeletonSistema ancho="50%" alto="14px" className="mt-4" />
        </TarjetaSistema>
      </SeccionesSistema>
    </PaginaSistema>
  )
}
