/**
 * A titled inset list of the home's cargo blocks and «Visión general»
 * (design/home-por-rol `.lista .fila`): tile, title, one detail line, an
 * optional status and attendance %, and a chevron when the row links
 * somewhere. 64px rows; the status is never color alone.
 *
 * Server-safe: no hooks, no handlers.
 */
import type { ReactElement, ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight, type LucideIcon } from 'lucide-react'

import { FONDO_TONO, PuntoEstado, type TonoEstado } from '@/components/ui/punto-estado'
import { cn } from '@/lib/utils'

import { CLASE_LINEA_FILA, CLASE_LISTA_INSET, EncabezadoSeccion, EnlaceSeccion, IconoTile } from './partes-inicio'

export type FilaInicio = {
  readonly clave: string
  readonly titulo: string
  readonly detalle?: string
  readonly icono: LucideIcon
  readonly tono?: TonoEstado | 'marca'
  readonly estado?: { readonly etiqueta: string; readonly tono: TonoEstado }
  /** Attendance %, with its bar. */
  readonly porcentaje?: number | null
  readonly href?: string
}

function Contenido({ fila }: { readonly fila: FilaInicio }): ReactElement {
  const tonoBarra = fila.estado?.tono ?? 'muted'
  return (
    <>
      <IconoTile icono={fila.icono} tono={fila.tono} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold text-foreground">{fila.titulo}</span>
        {fila.detalle && <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{fila.detalle}</span>}
        {fila.estado && <PuntoEstado tono={fila.estado.tono} etiqueta={fila.estado.etiqueta} className="mt-1" />}
      </span>
      {fila.porcentaje !== undefined && fila.porcentaje !== null && (
        <span className="grid w-14 shrink-0 gap-1 text-right">
          <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{fila.porcentaje}%</span>
          <span aria-hidden="true" className="block h-1 overflow-hidden rounded-full bg-muted">
            <span className={cn('block h-full rounded-full', FONDO_TONO[tonoBarra])} style={{ width: `${Math.min(100, Math.max(0, fila.porcentaje))}%` }} />
          </span>
        </span>
      )}
    </>
  )
}

export function ListaFilas({
  id,
  titulo,
  filas,
  enlace,
  children,
}: {
  readonly id: string
  readonly titulo: string
  readonly filas: readonly FilaInicio[]
  readonly enlace?: { readonly href: string; readonly texto: string }
  /** Extra content of the heading, e.g. a count. */
  readonly children?: ReactNode
}): ReactElement {
  const clase = 'flex min-h-16 min-w-0 items-center gap-3 px-3.5 py-2.5'
  return (
    <div className="min-w-0">
      <EncabezadoSeccion id={id} titulo={titulo} nivel={3}>
        {children}
        {enlace && <EnlaceSeccion href={enlace.href}>{enlace.texto}</EnlaceSeccion>}
      </EncabezadoSeccion>
      <ul aria-labelledby={id} className={CLASE_LISTA_INSET}>
        {filas.map((fila) => (
          <li key={fila.clave} className={CLASE_LINEA_FILA}>
            {fila.href ? (
              <Link href={fila.href} className={cn(clase, 'focus-ring touch-manipulation transition-colors active:bg-accent md:hover:bg-accent/60')}>
                <Contenido fila={fila} />
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ) : (
              <div className={clase}>
                <Contenido fila={fila} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
