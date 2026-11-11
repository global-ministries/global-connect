/**
 * R3g (odd/tasks/talleres-rediseno.md) — small server-safe pieces of
 * /talleres/reportes: the desktop crumbs "Talleres › Reportes", the mono
 * number, the edición and report status lines (status dot + written label,
 * never color alone) and the key figures of a drawer.
 */
import Link from 'next/link'
import type { ReactElement, ReactNode } from 'react'

import { PuntoEstado, type TonoEstado } from '@/components/ui/punto-estado'
import { rutaCatalogo } from '@/lib/platform/talleres/rutas'
import type { EdicionReporte, EstadoReporteGrupo } from '@/lib/platform/talleres/reportes-vista'
import { terminadaSinCerrar } from '@/lib/platform/talleres/reportes-vista'

export function MigasReportesTalleres(): ReactElement {
  return (
    <nav aria-label="Ubicación">
      <ol className="flex min-w-0 flex-wrap items-center gap-0.5 text-[13px]">
        <li className="flex min-w-0 items-center">
          <Link
            href={rutaCatalogo()}
            className="focus-ring truncate rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:min-h-11"
          >
            Talleres
          </Link>
        </li>
        <li aria-hidden="true" className="px-0.5 text-muted-foreground">
          ›
        </li>
        <li className="flex min-w-0 items-center">
          <span aria-current="page" className="truncate px-2 py-1.5 font-semibold text-foreground">
            Reportes
          </span>
        </li>
      </ol>
    </nav>
  )
}

export function Num({ children }: { readonly children: ReactNode }): ReactElement {
  return <strong className="font-mono font-semibold tabular-nums text-foreground">{children}</strong>
}

/** A count or «—» when it is not known yet. */
export function Cifra({ valor }: { readonly valor: number | null }): ReactElement {
  return valor === null ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    <span className="font-mono text-sm tabular-nums text-foreground">{valor.toLocaleString('es-VE')}</span>
  )
}

const ESTADO_EDICION: Record<EdicionReporte['estado'], { tono: TonoEstado; etiqueta: string }> = {
  abierto: { tono: 'success', etiqueta: 'Inscripción abierta' },
  en_curso: { tono: 'info', etiqueta: 'En curso' },
  cerrado: { tono: 'muted', etiqueta: 'Cerrada' },
  borrador: { tono: 'muted', etiqueta: 'Borrador' },
  cancelado: { tono: 'danger', etiqueta: 'Cancelada' },
}

export function estadoEdicion(e: Pick<EdicionReporte, 'estado' | 'cerradaEn'>): { tono: TonoEstado; etiqueta: string } {
  if (terminadaSinCerrar(e)) return { tono: 'warning', etiqueta: 'Terminó sin cerrar' }
  return ESTADO_EDICION[e.estado] ?? { tono: 'muted', etiqueta: e.estado }
}

export function EstadoEdicion({ edicion }: { readonly edicion: Pick<EdicionReporte, 'estado' | 'cerradaEn'> }): ReactElement {
  const { tono, etiqueta } = estadoEdicion(edicion)
  return <PuntoEstado tono={tono} etiqueta={etiqueta} />
}

const ESTADO_REPORTE: Record<EstadoReporteGrupo, { tono: TonoEstado; etiqueta: string }> = {
  borrador: { tono: 'warning', etiqueta: 'Sin enviar' },
  enviado: { tono: 'success', etiqueta: 'Enviado' },
  reabierto: { tono: 'danger', etiqueta: 'Reabierto' },
  cerrado: { tono: 'info', etiqueta: 'Cerrado' },
}

export function estadoReporte(estado: string): { tono: TonoEstado; etiqueta: string } {
  return ESTADO_REPORTE[estado as EstadoReporteGrupo] ?? { tono: 'muted', etiqueta: estado }
}

export function EstadoReporte({ estado }: { readonly estado: string }): ReactElement {
  const { tono, etiqueta } = estadoReporte(estado)
  return <PuntoEstado tono={tono} etiqueta={etiqueta} />
}

export interface DatoClave {
  readonly etiqueta: string
  readonly valor: number | string | null
  readonly pista?: string
}

export function DatosClave({ datos }: { readonly datos: readonly DatoClave[] }): ReactElement {
  return (
    <dl className="grid grid-cols-2 gap-2.5">
      {datos.map((dato) => (
        <div key={dato.etiqueta} className="min-w-0 rounded-xl border border-border/60 bg-card px-3.5 py-3">
          <dt className="text-xs text-muted-foreground">{dato.etiqueta}</dt>
          <dd className="mt-0.5 truncate font-mono text-xl tabular-nums text-foreground">
            {dato.valor === null ? '—' : typeof dato.valor === 'number' ? dato.valor.toLocaleString('es-VE') : dato.valor}
          </dd>
          {dato.pista && <dd className="mt-0.5 truncate text-xs text-muted-foreground">{dato.pista}</dd>}
        </div>
      ))}
    </dl>
  )
}
