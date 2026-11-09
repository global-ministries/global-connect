/**
 * Niños › Etiquetas — «Impresoras y estaciones» (artboard
 * design/ninos-checkin-pco/03-admin-etiquetas.html, `.est`): one row per
 * station with its connection (status dot + words, never color alone), label
 * size, jobs waiting and «Desactivada». Who manages the campus opens a row to
 * edit it (one detail panel per item); everyone else reads.
 */
import type { ReactElement } from 'react'
import { ChevronRight, Printer } from 'lucide-react'

import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { conexionEstacion, textoMedida, type EstacionVista } from '@/lib/platform/ninos/impresion-vista'
import { cn } from '@/lib/utils'

export interface ListaEstacionesProps {
  readonly estaciones: readonly EstacionVista[]
  readonly ahora: Date
  /** Opens the station panel; without it the rows are read-only. */
  readonly onAbrir?: (id: string) => void
  readonly actualId?: string | null
}

function Contenido({ e, ahora }: { readonly e: EstacionVista; readonly ahora: Date }): ReactElement {
  const conexion = conexionEstacion(e.ultimaConexion, ahora)
  return (
    <span className="grid min-w-0 flex-1 gap-0.5">
      <span className="flex min-w-0 items-center gap-2">
        <b className="min-w-0 truncate text-[14px] font-semibold text-foreground">{e.nombre}</b>
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground">
        {e.activa ? <PuntoEstado tono={conexion.tono} etiqueta={conexion.texto} /> : <PuntoEstado tono="muted" etiqueta="Desactivada" />}
        <span className="font-mono tabular-nums">{textoMedida(e)}</span>
        {e.pendientes > 0 && (
          <span>
            <span className="font-mono tabular-nums">{e.pendientes}</span> {e.pendientes === 1 ? 'etiqueta en cola' : 'etiquetas en cola'}
          </span>
        )}
      </span>
    </span>
  )
}

export function ListaEstaciones({ estaciones, ahora, onAbrir, actualId = null }: ListaEstacionesProps): ReactElement {
  if (estaciones.length === 0) {
    return (
      <EstadoVacioSistema
        icono={Printer}
        className="py-8"
        titulo="Todavía no hay impresoras"
        subtitulo="Agrega una estación por cada laptop de la mesa que tenga la impresora conectada."
      />
    )
  }
  return (
    <ul aria-label="Estaciones de impresión" className="min-w-0">
      {estaciones.map((e) => (
        <li key={e.id} className="min-w-0 border-border/60 [&+li]:border-t">
          {onAbrir ? (
            <button
              type="button"
              aria-label={`Abrir ${e.nombre}`}
              aria-haspopup="dialog"
              onClick={() => onAbrir(e.id)}
              className={cn(
                'focus-ring flex min-h-14 w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60',
                actualId === e.id && 'bg-brand-tint',
              )}
            >
              <Contenido e={e} ahora={ahora} />
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ) : (
            <div className="flex min-h-14 min-w-0 items-center gap-3 px-3 py-2.5">
              <Contenido e={e} ahora={ahora} />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
