/**
 * Estudiantes › Promover temporada — the applied / blocked state (S15
 * `promocion_reciente`, A24; `.done` of design/estudiantes-dps/13 / 14,
 * `#bloqueado`, `#hecho`, C23): one card with a lock, who applied it and
 * when, the next allowed date, what was applied (Grupos que subieron ·
 * Fichas que subieron de año · Grupos nuevos sin líder · Egresaron) and
 * "Ver Sin grupo de The Living Room" · "Ir a Grupos". Server-safe.
 */
import type { ReactElement } from 'react'
import Link from 'next/link'
import { Lock } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import type { EstadoBloqueado } from '@/lib/platform/estudiantes/promocion'

export interface EstadoPromovidoProps {
  readonly estado: EstadoBloqueado
  /** The The Living Room ámbito, for its "Sin grupo" in Grupos. */
  readonly theLivingRoom: { readonly id: string; readonly nombre: string } | null
}

export function EstadoPromovido({ estado, theLivingRoom }: EstadoPromovidoProps): ReactElement {
  return (
    <section aria-labelledby="promocion-hecha" className="mx-auto max-w-[640px] rounded-2xl bg-card px-5 py-7 text-center md:rounded-md md:border md:border-border md:px-6">
      <span aria-hidden="true" className="mx-auto mb-2.5 grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Lock className="size-5" />
      </span>
      <h2 id="promocion-hecha" className="text-lg font-[650] text-foreground">
        {estado.titulo}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{estado.texto}</p>
      {estado.datos.length > 0 && (
        <dl className="my-4 grid grid-cols-2 overflow-hidden rounded-md border border-border text-left sm:grid-cols-4">
          {estado.datos.map((dato) => (
            <div key={dato.etiqueta} className="-mr-px -mb-px min-w-0 px-2.5 py-2 shadow-[inset_-1px_-1px_0_var(--border)]">
              <dt className="text-xs text-muted-foreground">{dato.etiqueta}</dt>
              <dd className="mt-px font-mono text-sm font-semibold tabular-nums text-foreground">{dato.valor}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
        {theLivingRoom && (
          <BotonSistema asChild variante="outline">
            <Link href={`/estudiantes/grupos?ambito=${encodeURIComponent(theLivingRoom.id)}`}>{`Ver Sin grupo de ${theLivingRoom.nombre}`}</Link>
          </BotonSistema>
        )}
        <BotonSistema asChild variante="primario">
          <Link href="/estudiantes/grupos">Ir a Grupos</Link>
        </BotonSistema>
      </div>
    </section>
  )
}
