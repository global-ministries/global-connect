'use client'

/**
 * Pendientes — one group of alerts (artboard design/pendientes-director/01
 * `.gc`): a `TarjetaSistema` region titled by the alert type with its status
 * dot and count, one line on what to do, optional controls (the ficha pills)
 * and the rows, each with its direct action. The layout is the one of
 * "Solicitudes de cambio de área" (components/dream-team/solicitudes-cambio-area.tsx):
 * a card with a hairline-divided list. Long groups show five rows and the
 * rest on "Ver las N".
 */
import { useId, useState, type ReactElement, type ReactNode } from 'react'

import { BotonSistema, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { PuntoEstado, type TonoEstado } from '@/components/ui/punto-estado'

export const FILAS_VISIBLES = 5

export interface AccionFila {
  readonly texto: string
  /** Accessible name with the person or área ("Editar ficha de Ana Pérez"). */
  readonly etiqueta: string
  readonly onClick: () => void
  readonly primaria?: boolean
}

export interface FilaGrupo {
  readonly clave: string
  readonly titulo: string
  readonly subtitulo: string
  /** What is missing, already joined ("Sin cédula · Nació en 1900"). */
  readonly detalle?: string
  /** Absent when the viewer may not act on it: the row stays, without a button. */
  readonly accion?: AccionFila
}

export interface GrupoPendientesProps {
  readonly titulo: string
  readonly cantidad: number
  readonly tono: TonoEstado
  readonly descripcion: string
  readonly filas: readonly FilaGrupo[]
  /** Every row at once (the metric of this group is pressed). */
  readonly completo?: boolean
  /** A header action for the whole group ("Completar una por una"). */
  readonly accion?: ReactNode
  /** Controls between the description and the rows (the ficha pills). */
  readonly children?: ReactNode
}

export function GrupoPendientes({
  titulo,
  cantidad,
  tono,
  descripcion,
  filas,
  completo = false,
  accion,
  children,
}: GrupoPendientesProps): ReactElement {
  const id = useId()
  const [expandido, setExpandido] = useState(false)
  const todas = completo || expandido
  const visibles = todas ? filas : filas.slice(0, FILAS_VISIBLES)

  return (
    <TarjetaSistema role="region" aria-labelledby={id} className="min-w-0 space-y-3 p-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 id={id} className="flex min-w-0 items-center gap-2 text-base font-semibold text-foreground">
          <PuntoEstado tono={tono} />
          <span className="truncate">{titulo}</span>
          <span className="font-mono text-sm font-medium tabular-nums text-muted-foreground">{cantidad}</span>
        </h3>
        {accion}
      </div>
      <TextoSistema variante="sutil" tamaño="sm">
        {descripcion}
      </TextoSistema>
      {children}
      <ul className="divide-y divide-border/60">
        {visibles.map((fila) => (
          <li key={fila.clave} className="flex min-h-16 min-w-0 items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-foreground">{fila.titulo}</p>
              {fila.subtitulo && <p className="truncate text-[13px] text-muted-foreground">{fila.subtitulo}</p>}
              {fila.detalle && <p className="truncate text-xs text-muted-foreground">{fila.detalle}</p>}
            </div>
            {fila.accion && (
              <BotonSistema
                type="button"
                variante={fila.accion.primaria ? 'primario' : 'outline'}
                tamaño="sm"
                aria-label={fila.accion.etiqueta}
                onClick={fila.accion.onClick}
                className="shrink-0"
              >
                {fila.accion.texto}
              </BotonSistema>
            )}
          </li>
        ))}
      </ul>
      {!todas && filas.length > FILAS_VISIBLES && (
        <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
          <TextoSistema variante="sutil" tamaño="sm">
            y <span className="font-mono tabular-nums">{filas.length - FILAS_VISIBLES}</span> más
          </TextoSistema>
          <BotonSistema type="button" variante="ghost" tamaño="sm" aria-expanded={false} onClick={() => setExpandido(true)}>
            Ver las {filas.length}
          </BotonSistema>
        </div>
      )}
    </TarjetaSistema>
  )
}
