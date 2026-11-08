/**
 * DPS — loading skeleton for /dps/programacion. Keeps the frame of the real
 * screen (components/dps/programacion-client.tsx): the header band with the
 * title and the summary, the toolbar and the sheet region with a few rows
 * (docs/design-system/patterns.md#empty-and-loading-states).
 */
import { PaginaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'

export default function LoadingDpsProgramacion() {
  return (
    <PaginaSistema>
      <div className="-m-4 sm:-m-6 lg:-mx-12 lg:-my-8">
        <div className="space-y-2 px-4 pt-4 sm:px-6 md:border-b md:border-border md:bg-card md:pb-3.5">
          <SkeletonSistema ancho="280px" alto="28px" className="max-w-full" />
          <SkeletonSistema ancho="520px" alto="18px" className="max-w-full" />
        </div>
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3 sm:px-6 md:py-2.5">
          <SkeletonSistema ancho="96px" alto="44px" className="rounded-xl" />
          <SkeletonSistema ancho="160px" alto="44px" className="rounded-xl" />
          <SkeletonSistema ancho="140px" alto="36px" className="hidden rounded-xl md:block" />
        </div>
        <div className="mx-4 space-y-px overflow-hidden rounded-md border border-border sm:mx-6">
          {Array.from({ length: 10 }, (_, i) => (
            <SkeletonSistema key={i} alto="36px" className="w-full rounded-none" />
          ))}
        </div>
      </div>
    </PaginaSistema>
  )
}
