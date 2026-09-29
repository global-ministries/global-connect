'use client'

/**
 * Directores — the card of one general director: avatar, name, the other role
 * they hold (Administrador / Pastor), the summary line and, below, either the
 * "Todos los segmentos" row (a person who holds every segment with scope
 * `segmento`) or one row per segment. "Cambiar alcance" opens the per-segment
 * rows of an all-segments card; "Agregar segmento" assigns one they do not hold.
 * Read-only cards (a director general viewing their own) have none of those.
 */
import { useState, type ReactElement } from 'react'
import { Plus } from 'lucide-react'

import { BadgeSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { asignarSegmentoDG } from '@/lib/actions/dg-segmentos.actions'
import { cn } from '@/lib/utils'
import type { TarjetaGeneral } from '@/lib/platform/grupos-vida/directores-vista'
import { ANILLO } from './franja-por-ordenar'
import { SegmentoDeGeneralFila } from './segmento-de-general'
import type { useGuardarCambio } from './use-guardar-cambio'

export interface TarjetaDirectorGeneralProps {
  readonly tarjeta: TarjetaGeneral
  readonly guardado: ReturnType<typeof useGuardarCambio>
}

const BOTON_SECUNDARIO = cn(
  'inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent',
  ANILLO,
)

export function TarjetaDirectorGeneral({ tarjeta, guardado }: TarjetaDirectorGeneralProps): ReactElement {
  const [verSegmentos, setVerSegmentos] = useState(false)
  const [eligiendoSegmento, setEligiendoSegmento] = useState(false)

  const mostrarSegmentos = !tarjeta.todos || verSegmentos
  const clave = `${tarjeta.usuarioId}:nuevo-segmento`

  function agregarSegmento(segmentoId: string): void {
    setEligiendoSegmento(false)
    void guardado.guardar(
      clave,
      segmentoId,
      () => asignarSegmentoDG({ usuarioId: tarjeta.usuarioId, segmentoId }),
      'Segmento agregado.',
    )
  }

  return (
    <TarjetaSistema variante="outlined" className="p-0">
      <article aria-label={tarjeta.nombre} className="flex flex-col gap-4 p-5 md:px-6">
        <div className="flex items-center gap-3.5">
          <div
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--brand-accent-strong)] text-[15px] font-bold text-[var(--brand-primary)]"
          >
            {tarjeta.iniciales}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-[17px] font-semibold text-foreground">{tarjeta.nombre}</h2>
              {tarjeta.otroRol && (
                <BadgeSistema variante={tarjeta.otroRol === 'Administrador' ? 'info' : 'default'} tamaño="sm">
                  {tarjeta.otroRol}
                </BadgeSistema>
              )}
            </div>
            <p className="text-[13px] text-muted-foreground">{tarjeta.resumen}</p>
          </div>
          {tarjeta.editable && tarjeta.todos && (
            <button
              type="button"
              aria-expanded={verSegmentos}
              onClick={() => setVerSegmentos((actual) => !actual)}
              className={cn(BOTON_SECUNDARIO, 'shrink-0')}
            >
              Cambiar alcance
            </button>
          )}
        </div>

        {tarjeta.todos && !mostrarSegmentos && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background px-3.5 py-3">
            <BadgeSistema variante="info" tamaño="sm">
              Todos los segmentos
            </BadgeSistema>
            <span className="text-sm text-muted-foreground">Ve y administra todos los grupos</span>
          </div>
        )}

        {mostrarSegmentos && tarjeta.segmentos.length > 0 && (
          <div className="flex flex-col gap-3">
            {tarjeta.segmentos.map((segmento) => (
              <SegmentoDeGeneralFila
                key={segmento.segmentoId}
                usuarioId={tarjeta.usuarioId}
                segmento={segmento}
                editable={tarjeta.editable}
                guardado={guardado}
              />
            ))}
          </div>
        )}

        {tarjeta.editable && tarjeta.segmentosDisponibles.length > 0 && (
          <div className="flex flex-col gap-2">
            <div>
              <button
                type="button"
                aria-expanded={eligiendoSegmento}
                disabled={guardado.pendiente(clave)}
                onClick={() => setEligiendoSegmento((actual) => !actual)}
                className={cn(BOTON_SECUNDARIO, 'disabled:opacity-60')}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Agregar segmento
              </button>
            </div>
            {eligiendoSegmento && (
              <div role="group" aria-label="Segmentos disponibles" className="flex flex-wrap gap-2">
                {tarjeta.segmentosDisponibles.map((segmento) => (
                  <button
                    key={segmento.id}
                    type="button"
                    onClick={() => agregarSegmento(segmento.id)}
                    className={cn(BOTON_SECUNDARIO, 'rounded-full')}
                  >
                    {segmento.nombre}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </article>
    </TarjetaSistema>
  )
}
