/**
 * DPS — loading skeleton for /dps/matriz. Keeps the frame of the real
 * screen (components/dps/matriz-client.tsx): the header band with the title
 * and the summary, the toolbar and the matrix region with a few rows
 * (docs/design-system/patterns.md#empty-and-loading-states).
 */
import { PaginaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'

export default function LoadingDpsMatriz() {
  return (
    <PaginaSistema>
      <div className="-m-4 sm:-m-6 lg:-mx-12 lg:-my-8">
        <div className="space-y-2 px-4 pt-4 sm:px-6 md:border-b md:border-border md:bg-card md:pb-3.5">
          <SkeletonSistema ancho="280px" alto="28px" className="max-w-full" />
          <SkeletonSistema ancho="460px" alto="18px" className="max-w-full" />
        </div>
        <div className="hidden items-center gap-2.5 px-6 py-2.5 md:flex">
          <SkeletonSistema ancho="180px" alto="44px" className="rounded-xl" />
          <SkeletonSistema ancho="190px" alto="38px" className="rounded-xl" />
        </div>
        <div className="mx-6 hidden space-y-px overflow-hidden rounded-md border border-border md:block">
          {Array.from({ length: 10 }, (_, i) => (
            <SkeletonSistema key={i} alto="44px" className="w-full rounded-none" />
          ))}
        </div>
      </div>
    </PaginaSistema>
  )
}
