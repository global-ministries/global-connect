/**
 * R3c (odd/tasks/talleres-rediseno.md) — small pieces of the v2 /talleres
 * catálogo shared by the list and the drawer: the taller tile, the cupo line
 * with its proportion bar (the MetricasAtencion bar look) and the attention
 * flags of a row. Server-safe: no hooks.
 */

import type { ReactElement } from 'react'
import Link from 'next/link'
import { BookOpen, Layers, Users } from 'lucide-react'

import { FONDO_TONO, PuntoEstado } from '@/components/ui/punto-estado'
import { RUTA_PROXIMO_PASO } from '@/lib/platform/talleres/proximo-paso-registro'
import { cn } from '@/lib/utils'

import { plural, unidadDe, type FilaCatalogo } from './vista-catalogo'

/** 40px brand-tint tile: Próximo Paso, a couples taller or any other taller. Decorative. */
export function TileTaller({ fila }: { readonly fila: FilaCatalogo }): ReactElement {
  const Icono = fila.externo ? Layers : fila.proxima?.tipo === 'pareja' ? Users : BookOpen
  return (
    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand-text">
      <Icono className="size-[18px]" />
    </span>
  )
}

function porcentaje(valor: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, (valor / total) * 100))
}

/** «14 de 30 personas · mín. 10» and the bar with the mínimo mark; without cupo, only the count. */
export function BarraCupo({ fila, compacta = false }: { readonly fila: FilaCatalogo; readonly compacta?: boolean }): ReactElement | null {
  const e = fila.proxima
  if (!e) return null
  const minimo = fila.taller.minimo_inscritos
  const conCupo = fila.cupo !== null && fila.cupo > 0
  const tono = fila.faltanParaMinimo !== null ? 'warning' : 'success'
  return (
    <div className={cn('grid min-w-0 gap-1.5', compacta ? 'text-[13px]' : 'text-sm')}>
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <span className="truncate text-foreground">
          <strong className="font-mono font-semibold tabular-nums">{e.ocupados}</strong>
          {conCupo ? (
            <>
              {' de '}
              <span className="font-mono tabular-nums">{fila.cupo}</span> {unidadDe(e, fila.cupo ?? 0)}
            </>
          ) : (
            <> {unidadDe(e, e.ocupados)}</>
          )}
        </span>
        {minimo !== null && (
          <small className="shrink-0 text-xs text-muted-foreground">
            mín. <span className="font-mono tabular-nums">{minimo}</span>
          </small>
        )}
      </div>
      {conCupo ? (
        <span aria-hidden="true" className="relative block h-1 overflow-visible rounded-full bg-muted">
          <span className={cn('block h-full rounded-full', FONDO_TONO[tono])} style={{ width: `${porcentaje(e.ocupados, fila.cupo ?? 0)}%` }} />
          {minimo !== null && (
            <span
              className="absolute -top-0.5 h-2 w-0.5 rounded-full bg-foreground/60"
              style={{ left: `${porcentaje(minimo, fila.cupo ?? 0)}%` }}
            />
          )}
        </span>
      ) : (
        fila.cupo === 0 && <span className="text-xs text-muted-foreground">Sin cupo definido</span>
      )}
    </div>
  )
}

/** The attention flags of a row (status dot + words, never color alone); «Al día» when there are none. */
export function AtencionFila({ fila }: { readonly fila: FilaCatalogo }): ReactElement {
  const marcas: ReactElement[] = []
  if (fila.pendientes > 0) {
    marcas.push(<PuntoEstado key="p" tono="warning" etiqueta={`${fila.pendientes} por aprobar`} />)
  }
  if (fila.faltanParaMinimo !== null) {
    marcas.push(
      <PuntoEstado
        key="m"
        tono="danger"
        etiqueta={`${plural(fila.faltanParaMinimo, 'Falta', 'Faltan')} ${fila.faltanParaMinimo} para el mínimo`}
      />,
    )
  } else if (fila.edicionesBajoMinimo > 0) {
    marcas.push(<PuntoEstado key="m" tono="danger" etiqueta="Bajo el mínimo" />)
  }
  if ((fila.gruposSinFacilitador ?? 0) > 0) {
    const n = fila.gruposSinFacilitador ?? 0
    marcas.push(<PuntoEstado key="f" tono="info" etiqueta={`${n} ${plural(n, 'grupo sin facilitador', 'grupos sin facilitador')}`} />)
  }
  if (fila.externo) {
    marcas.push(
      <Link
        key="pp"
        href={RUTA_PROXIMO_PASO}
        className="focus-ring relative z-10 inline-flex min-h-11 w-fit items-center rounded-md text-[13px] font-medium text-brand-text hover:underline"
      >
        Se gestiona en Próximo Paso
      </Link>,
    )
  }
  if (marcas.length === 0) return <span className="text-[13px] text-muted-foreground">Al día</span>
  return <span className="grid min-w-0 gap-1">{marcas}</span>
}
