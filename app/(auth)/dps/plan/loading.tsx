/**
 * DPS — loading skeleton for /dps/plan. Keeps the frame of the real screen
 * (components/dps/plan-client.tsx): the header band with the cover, title
 * and date pill, the toolbar with the tabs and the summary, and a few team
 * columns (docs/design-system/patterns.md#empty-and-loading-states).
 */
import { PaginaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'

export default function LoadingDpsPlan() {
  return (
    <PaginaSistema>
      <div className="-m-4 sm:-m-6 lg:-mx-12 lg:-my-8">
        <div className="flex items-center gap-5 px-4 pt-4 sm:px-6 md:border-b md:border-border md:bg-card md:py-4">
          <SkeletonSistema className="h-[60px] w-24 shrink-0 rounded-md md:h-[100px] md:w-40" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonSistema ancho="320px" alto="28px" className="max-w-full" />
            <SkeletonSistema ancho="260px" alto="30px" className="max-w-full rounded-full" />
          </div>
        </div>
        <div className="flex items-center gap-4 px-4 pt-4 pb-3 sm:px-6">
          <SkeletonSistema ancho="180px" alto="38px" className="rounded-xl" />
          <SkeletonSistema ancho="240px" alto="16px" className="hidden sm:block" />
        </div>
        <div className="flex flex-col gap-2.5 px-4 pb-8 sm:px-6 md:flex-row">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonSistema key={i} alto="280px" className="w-full rounded-md md:w-[196px]" />
          ))}
        </div>
      </div>
    </PaginaSistema>
  )
}
