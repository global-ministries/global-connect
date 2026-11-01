/**
 * Estudiantes › Promover temporada — the applied / blocked state (artboards
 * 09 / 10 `#bloqueado`, `#hecho`; S15 `promocion_reciente`, A24): the
 * `EstadoVacioSistema` look with a lock inside the list surface, who applied
 * it and when, the next allowed date, "Ir a Grupos" and "Ver Sin grupo de
 * The Living Room", then what was applied.
 */
import type { ReactElement } from 'react'
import Link from 'next/link'
import { Lock } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import type { EstadoBloqueado } from '@/lib/platform/estudiantes/promocion'

export interface EstadoPromovidoProps {
  readonly estado: EstadoBloqueado
  /** The The Living Room ámbito, for its "Sin grupo" in Grupos. */
  readonly theLivingRoom: { readonly id: string; readonly nombre: string } | null
}

export function EstadoPromovido({ estado, theLivingRoom }: EstadoPromovidoProps): ReactElement {
  return (
    <div className="space-y-4">
      <div className="min-w-0 overflow-hidden rounded-2xl bg-card md:border md:border-border/60">
        <EstadoVacioSistema
          icono={Lock}
          titulo={estado.titulo}
          subtitulo={estado.texto}
          accion={
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <BotonSistema asChild variante="primario">
                <Link href="/estudiantes/grupos">Ir a Grupos</Link>
              </BotonSistema>
              {theLivingRoom && (
                <BotonSistema asChild variante="outline">
                  <Link href={`/estudiantes/grupos?ambito=${encodeURIComponent(theLivingRoom.id)}`}>{`Ver Sin grupo de ${theLivingRoom.nombre}`}</Link>
                </BotonSistema>
              )}
            </div>
          }
        />
      </div>
      {estado.datos.length > 0 && (
        <dl className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {estado.datos.map((dato) => (
            <div key={dato.etiqueta} className="min-w-0 rounded-xl border border-border/60 bg-card px-3.5 py-3">
              <dt className="text-xs text-muted-foreground">{dato.etiqueta}</dt>
              <dd className="mt-0.5 font-mono text-xl tabular-nums text-foreground">{dato.valor}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
