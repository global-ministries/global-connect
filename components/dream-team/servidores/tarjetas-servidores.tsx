'use client'

/**
 * Servidores on phones (below `md`): one card per servicio — avatar, name,
 * "equipo · rol", the campus shifts, the etapa and the marks (Sin cuenta, N equipos, Grupos de
 * Vida), the phone and the "⋯" menu (a 44px button). Group headers (when the
 * URL asks to group) sit between the cards.
 */
import type { ReactElement } from 'react'

import { BadgeSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { ESTADO_BADGE_VARIANTE, ESTADO_LABELS } from '@/components/dream-team/labels'
import { inicialesDe } from '@/lib/platform/dream-team/mi-equipo-vista'
import type { FilaVista, ItemLista } from '@/lib/platform/dream-team/servidores-vista'
import { MenuServidor } from './menu-servidor'
import { MarcasDeFila } from './tabla-servidores'
import { TelefonoServidor } from './telefono-servidor'

export interface TarjetasServidoresProps {
  readonly items: readonly ItemLista[]
  readonly onActualizado: () => void
}

export function TarjetasServidores({ items, onActualizado }: TarjetasServidoresProps): ReactElement {
  return (
    <ul aria-label="Servicios en tarjetas" className="space-y-2 md:hidden">
      {items.map((item) =>
        item.tipo === 'grupo' ? (
          <li key={`grupo-${item.clave}`} className="px-1 pt-2 text-sm">
            <span className="font-semibold text-foreground">{item.titulo}</span>
            <span className="ml-2 text-muted-foreground">{item.detalle}</span>
          </li>
        ) : (
          <li key={item.fila.clave}>
            <Tarjeta fila={item.fila} onActualizado={onActualizado} />
          </li>
        ),
      )}
    </ul>
  )
}

function Tarjeta({ fila, onActualizado }: { readonly fila: FilaVista; readonly onActualizado: () => void }): ReactElement {
  return (
    <TarjetaSistema className="flex items-start gap-3 p-4">
      <div
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-accent-strong)] text-sm font-bold text-[var(--brand-primary)]"
      >
        {inicialesDe(fila.nombre)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium text-foreground">{fila.nombre}</p>
        <p className="text-sm text-muted-foreground">{`${fila.equipoLabel} · ${fila.rolLabel}`}</p>
        <p className="text-sm text-muted-foreground">{`Turno: ${fila.turnosTexto}`}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <BadgeSistema variante={ESTADO_BADGE_VARIANTE[fila.estado]} tamaño="sm">
            {ESTADO_LABELS[fila.estado]}
          </BadgeSistema>
          <MarcasDeFila fila={fila} />
        </div>
        <TelefonoServidor telefono={fila.telefono} />
      </div>
      <MenuServidor fila={fila} onActualizado={onActualizado} className="-mr-2 -mt-2" />
    </TarjetaSistema>
  )
}
