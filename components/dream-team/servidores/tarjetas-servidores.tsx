'use client'

/**
 * Servidores on phones (below `md`). "Por persona" (the default): one card per
 * person — avatar, name, the marks (Sin cuenta, Grupos de Vida) and the phone
 * once, then one line per servicio ("equipo · rol", the campus shifts, the
 * etapa and its own "⋯" menu, a 44px button); past three servicios "+N más"
 * expands the rest. "Sin agrupar" / "Por equipo": one card per servicio, with
 * the "N equipos" mark, and group headers between the cards.
 */
import type { ReactElement } from 'react'

import { BadgeSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { ESTADO_BADGE_VARIANTE, ESTADO_LABELS } from '@/components/dream-team/labels'
import { inicialesDe } from '@/lib/platform/dream-team/mi-equipo-vista'
import type { FilaVista, ItemLista, PersonaLista } from '@/lib/platform/dream-team/servidores-vista'
import { MenuServidor } from './menu-servidor'
import { MarcaGruposVidaDeServicio, MarcasDeFila, MarcasDePersona, useServiciosDePersona } from './tabla-servidores'
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
        ) : item.tipo === 'persona' ? (
          <li key={item.clave} aria-label={item.nombre}>
            <TarjetaPersona persona={item} onActualizado={onActualizado} />
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

function Avatar({ nombre }: { readonly nombre: string }): ReactElement {
  return (
    <div
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-tint text-sm font-bold text-brand-text"
    >
      {inicialesDe(nombre)}
    </div>
  )
}

function Tarjeta({ fila, onActualizado }: { readonly fila: FilaVista; readonly onActualizado: () => void }): ReactElement {
  return (
    <TarjetaSistema className="flex items-start gap-3 p-4">
      <Avatar nombre={fila.nombre} />
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

function TarjetaPersona({
  persona,
  onActualizado,
}: {
  readonly persona: PersonaLista
  readonly onActualizado: () => void
}): ReactElement {
  const { visibles, toggle } = useServiciosDePersona(persona)
  const varios = persona.filas.length > 1
  return (
    <TarjetaSistema className="p-4">
      <div className="flex items-start gap-3">
        <Avatar nombre={persona.nombre} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-medium text-foreground">{persona.nombre}</p>
            <MarcasDePersona persona={persona} />
          </div>
          <TelefonoServidor telefono={persona.telefono} />
        </div>
      </div>
      <ul aria-label={`Servicios de ${persona.nombre}`} className="mt-2 divide-y divide-border border-t border-border">
        {visibles.map((fila) => (
          <li key={fila.clave} className="flex items-start gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">{`${fila.equipoLabel} · ${fila.rolLabel}`}</p>
              <p className="text-sm text-muted-foreground">{`Turno: ${fila.turnosTexto}`}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <BadgeSistema variante={ESTADO_BADGE_VARIANTE[fila.estado]} tamaño="sm">
                  {ESTADO_LABELS[fila.estado]}
                </BadgeSistema>
                <MarcaGruposVidaDeServicio persona={persona} fila={fila} />
              </div>
            </div>
            <MenuServidor
              fila={fila}
              onActualizado={onActualizado}
              detalle={varios ? fila.equipoLabel : undefined}
              className="-mr-2"
            />
          </li>
        ))}
      </ul>
      {toggle}
    </TarjetaSistema>
  )
}
