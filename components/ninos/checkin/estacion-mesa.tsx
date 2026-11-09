/**
 * Niños › Check-in — the printer of this desk (artboard
 * design/ninos-checkin-pco/05-mesa-tableta.html, the «Mesa 1 · lista» pill;
 * T3b, S10): a native select with the active stations and their connection,
 * then one small line: connected, or the notice that the código stays on
 * screen when none is chosen or the station is offline. Informative only: the
 * check-in is never blocked. Nothing renders when the campus has no stations.
 */
import type { ReactElement } from 'react'
import { AlertTriangle } from 'lucide-react'

import { PuntoEstado } from '@/components/ui/punto-estado'
import { SelectSistema } from '@/components/ui/sistema-diseno'
import { conexionEstacion } from '@/lib/platform/ninos/impresion-vista'

import type { EstacionMesa as Estado } from './use-estacion-mesa'

export function EstacionMesa({ estado }: { readonly estado: Estado }): ReactElement | null {
  const { estaciones, elegida, elegir, aviso } = estado
  if (estaciones.length === 0) return null
  return (
    <div className="grid min-w-0 gap-1.5">
      <SelectSistema
        label="Impresora de esta mesa"
        opciones={[
          { valor: '', etiqueta: 'Sin impresora' },
          ...estaciones.map((e) => ({ valor: e.id, etiqueta: `${e.nombre} · ${conexionEstacion(e.ultimaConexion).texto}` })),
        ]}
        value={elegida?.id ?? ''}
        onValueChange={(id) => elegir(id || null)}
      />
      {aviso ? (
        <p role="status" className="flex min-w-0 items-start gap-1.5 text-[13px] text-warning-text">
          <AlertTriangle aria-hidden="true" className="mt-px size-4 shrink-0" />
          <span className="min-w-0">{aviso}</span>
        </p>
      ) : (
        elegida && <PuntoEstado tono="success" etiqueta={`${elegida.nombre} · lista para imprimir`} className="text-[13px] text-muted-foreground" />
      )}
    </div>
  )
}
