/**
 * DPS › Plan — the header band of the plan (`.hd` of
 * prototipos/planificacion-dps/01-plan-domingo-equipos.html; planned
 * `EncabezadoAmplio`, `PortadaSerie` and `PastillaFecha` of
 * docs/design-system/components.md#planning-style-components, local here
 * until they move to components/ui). From md: a `bg-card` band with a
 * bottom border and 24px gutters — the series cover (160 × 100, the image or
 * a `chart-1`/`chart-5` tint with the series name), the h1 at 24px / 650,
 * the date pill "‹ Domingo 8 nov 2026 ›" stepping to the plans that exist
 * and the meta line "9:15 y 11:15 · llegada 7:00"; the 36px actions at the
 * right. On a phone the title is the large title (28px / 700) and the cover
 * shrinks. Under the meta line, the answers of the convocados when the plan
 * reads its notices (`resumen`, design/dps-avisos/01 `.est`). Server-safe.
 */
import type { ReactElement, ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'

import { etiquetaFechaPlan, fechaHablada, metaHorarios, tituloCabecera, type PlanCabecera } from '@/lib/platform/dps/plan'
import { cn } from '@/lib/utils'

export const hrefPlan = (id: string): string => `/dps/plan?plan=${encodeURIComponent(id)}`

const CLASE_TITULO = 'text-[28px] font-bold leading-[1.15] tracking-[-0.03em] text-foreground md:text-2xl md:font-[650] md:tracking-[-0.02em]'

const CLASE_PASO =
  'focus-ring grid size-[30px] shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:size-11'

function PortadaSerie({ nombre, url }: { readonly nombre: string; readonly url: string | null }): ReactElement {
  return (
    <div
      aria-hidden="true"
      data-testid="portada-serie"
      className={cn(
        'relative flex h-[60px] w-24 shrink-0 flex-col justify-end overflow-hidden rounded-md border px-2 py-1.5 md:h-[100px] md:w-40 md:px-3 md:py-2.5',
        'border-[color-mix(in_oklab,var(--chart-1)_35%,transparent)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--chart-1)_30%,var(--card)),color-mix(in_oklab,var(--chart-5)_22%,var(--card)))]',
      )}
    >
      {url ? (
        <Image src={url} alt="" fill sizes="160px" unoptimized className="object-cover" />
      ) : (
        <span className="line-clamp-3 text-[11px] font-[750] uppercase leading-[1.1] tracking-[-0.01em] text-foreground md:text-[13px]">{nombre}</span>
      )}
    </div>
  )
}

function Paso({ plan, direccion }: { readonly plan: PlanCabecera | null; readonly direccion: 'anterior' | 'siguiente' }): ReactElement {
  const Icono = direccion === 'anterior' ? ChevronLeft : ChevronRight
  if (!plan) {
    return (
      <button type="button" disabled aria-label={`No hay plan ${direccion}`} className={cn(CLASE_PASO, 'disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent')}>
        <Icono aria-hidden="true" className="size-3.5" />
      </button>
    )
  }
  return (
    <Link href={hrefPlan(plan.id)} aria-label={`Plan ${direccion}, ${fechaHablada(plan.fecha)}`} className={CLASE_PASO}>
      <Icono aria-hidden="true" className="size-3.5" />
    </Link>
  )
}

export interface EncabezadoPlanProps {
  readonly plan: PlanCabecera
  readonly anterior: PlanCabecera | null
  readonly siguiente: PlanCabecera | null
  /** Public URL of the series cover; null shows the tint with the name. */
  readonly portadaUrl: string | null
  /** 36px actions at the right ("Acciones ▾"). */
  readonly acciones?: ReactNode
  /** The answers of the convocados (avisos-estado.tsx, ResumenRespuestas). */
  readonly resumen?: ReactNode
}

export function EncabezadoPlan({ plan, anterior, siguiente, portadaUrl, acciones, resumen }: EncabezadoPlanProps): ReactElement {
  return (
    <header className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 pt-4 sm:px-6 md:border-b md:border-border md:bg-card md:py-4">
      {plan.serie && <PortadaSerie nombre={plan.serie.nombre} url={portadaUrl} />}
      <div className="min-w-0 flex-1 basis-64 space-y-2">
        <h1 className={cn(CLASE_TITULO, 'break-words')}>{tituloCabecera(plan)}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="inline-flex items-center rounded-full border border-border bg-background text-[13px] font-medium">
            <Paso plan={anterior} direccion="anterior" />
            <span className="px-1.5">{etiquetaFechaPlan(plan.fecha)}</span>
            <Paso plan={siguiente} direccion="siguiente" />
          </div>
          <p className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
            <Clock aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="tabular-nums">{metaHorarios(plan)}</span>
          </p>
          {plan.serie && plan.titulo && <p className="text-[13px] text-muted-foreground">{plan.titulo}</p>}
        </div>
        {resumen}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </header>
  )
}
