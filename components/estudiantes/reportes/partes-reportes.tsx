/**
 * Estudiantes › Reportes — small shared pieces of the screen (artboards 11 /
 * 12 of design/estudiantes-asistencia). Two of them cover gaps listed under
 * "Planned components" in docs/design-system/components.md until the system
 * has them:
 * - GR2 `IndicadorTendencia`: arrow + word ("Sube 6", "Baja 17", "Estable",
 *   "Sin datos previos") on `success-text` / `danger-text` / muted, with the
 *   full sentence as its accessible name (never color alone).
 * - GR4 `CeldaPorcentaje`: the value in mono and a proportion bar on the one
 *   percentage scale of patterns.md (≥80 success, ≥60 warning, ≥40 brand,
 *   else danger).
 * `DatosClave` is the key/value grid of the drawers (as in Promover
 * temporada) and `MigasReportes` the breadcrumbs "Estudiantes / Reportes".
 */
import type { ReactElement } from 'react'
import { Minus, TrendingDown, TrendingUp } from 'lucide-react'

import { tonoPorcentaje, type DatoDetalle, type Tendencia, type TonoPorcentaje } from '@/lib/platform/estudiantes/reportes'
import { cn } from '@/lib/utils'

const RELLENO: Readonly<Record<TonoPorcentaje, string>> = {
  success: 'bg-success',
  warning: 'bg-warning',
  brand: 'bg-brand',
  danger: 'bg-danger',
}

/** The GR4 proportion bar alone (decorative: the value is always written next to it). */
export function BarraPorcentaje({ porcentaje, className }: { readonly porcentaje: number; readonly className?: string }): ReactElement {
  const ancho = Math.min(100, Math.max(0, Math.round(porcentaje)))
  return (
    <span aria-hidden="true" className={cn('block h-1 overflow-hidden rounded-full bg-muted', className)}>
      <span className={cn('block h-full rounded-full', RELLENO[tonoPorcentaje(porcentaje)])} style={{ width: `${ancho}%` }} />
    </span>
  )
}

export function CeldaPorcentaje({
  porcentaje,
  vacio = 'Sin reuniones',
  detalle,
}: {
  readonly porcentaje: number | null
  readonly vacio?: string
  /** "7 de 8" next to the value (The Living Room, A37). */
  readonly detalle?: string
}): ReactElement {
  if (porcentaje === null) return <span className="text-[13px] text-muted-foreground">{vacio}</span>
  const ancho = Math.min(100, Math.max(0, Math.round(porcentaje)))
  return (
    <div className="grid w-full min-w-0 gap-1.5">
      <span className="truncate font-mono text-[15px] tabular-nums text-foreground">
        {ancho}%{detalle && <small className="ml-1 text-[13px] text-muted-foreground">{detalle}</small>}
      </span>
      <BarraPorcentaje porcentaje={porcentaje} className="max-w-[140px]" />
    </div>
  )
}

const ICONO_TENDENCIA = { sube: TrendingUp, baja: TrendingDown, estable: Minus, sin_datos: null } as const

export function IndicadorTendencia({ tendencia, compacto = false }: { readonly tendencia: Tendencia; readonly compacto?: boolean }): ReactElement | null {
  // Phone rows drop "Sin datos previos" (the meta has no room); the drawer says it.
  if (compacto && tendencia.tipo === 'sin_datos') return null
  const Icono = ICONO_TENDENCIA[tendencia.tipo]
  return (
    <span
      role="img"
      aria-label={tendencia.accesible}
      className={cn(
        'inline-flex min-w-0 items-center gap-1 whitespace-nowrap font-medium',
        compacto ? 'text-xs' : 'text-[13px]',
        tendencia.tipo === 'sube' ? 'text-success-text' : tendencia.tipo === 'baja' ? 'text-danger-text' : 'text-muted-foreground',
      )}
    >
      {Icono && <Icono aria-hidden="true" className="size-4 shrink-0" />}
      <span aria-hidden="true">{tendencia.texto}</span>
    </span>
  )
}

export function DatosClave({ datos }: { readonly datos: readonly DatoDetalle[] }): ReactElement {
  return (
    <dl className="grid grid-cols-2 gap-2.5">
      {datos.map((dato) => (
        <div key={dato.etiqueta} className="min-w-0 rounded-xl border border-border/60 bg-card px-3.5 py-3">
          <dt className="text-xs text-muted-foreground">{dato.etiqueta}</dt>
          <dd className="mt-0.5 truncate font-mono text-xl tabular-nums text-foreground">{dato.valor}</dd>
        </div>
      ))}
    </dl>
  )
}

export function MigasReportes(): ReactElement {
  return (
    <nav aria-label="Ubicación">
      <ol className="flex min-w-0 flex-wrap items-center gap-0.5 text-sm">
        <li className="flex min-w-0 items-center">
          <span className="truncate px-2 py-1.5 text-muted-foreground">Estudiantes</span>
        </li>
        <li className="flex min-w-0 items-center gap-0.5">
          <span aria-hidden="true" className="px-0.5 text-muted-foreground">
            /
          </span>
          <span aria-current="page" className="truncate px-2 py-1.5 font-semibold text-foreground">
            Reportes
          </span>
        </li>
      </ol>
    </nav>
  )
}
