'use client'

/**
 * Estudiantes › Promover temporada — one decision card per last-Transit-year
 * group (S12, artboards 09 / 10 `.s-card.decision`): the group, "Por decidir"
 * / "Decidido", and a single-choice list of the two options with a sentence
 * of consequence each (gap GP1, `ListaOpciones`, composed here as a
 * `fieldset` of native radios on the inset list surface). An option Inside
 * Out cannot take is disabled with its reason. The notices of the chosen
 * option are announced politely.
 *
 * Planning style (`.dc` of design/estudiantes-dps/13 / 14, C18, C25): a
 * `rounded-md` card with a header bar (14px / 650 name, 12px route and the
 * status tag) and its border in warning while it waits; 56px option rows.
 */
import type { ReactElement } from 'react'

import { BadgeSistema } from '@/components/ui/sistema-diseno'
import type { Decision, TarjetaDecision as Tarjeta } from '@/lib/platform/estudiantes/promocion'
import { cn } from '@/lib/utils'

import { AvisoPromocion, ConNumeros } from './partes-promocion'

/** The id of an option's radio ("Ir a la decisión" focuses the first one). */
export const idOpcion = (grupoId: string, valor: Decision): string => `promocion-opcion-${grupoId}-${valor}`
export const idDecision = (grupoId: string): string => `promocion-decision-${grupoId}`

export interface TarjetaDecisionProps {
  readonly tarjeta: Tarjeta
  readonly onDecidir: (grupoId: string, decision: Decision) => void
}

export function TarjetaDecision({ tarjeta, onDecidir }: TarjetaDecisionProps): ReactElement {
  const titulo = `${idDecision(tarjeta.grupoId)}-titulo`
  return (
    <article
      id={idDecision(tarjeta.grupoId)}
      aria-labelledby={titulo}
      className={cn(
        'min-w-0 scroll-mt-4 overflow-hidden rounded-md border bg-card',
        tarjeta.decidido ? 'border-border' : 'border-[color-mix(in_oklab,var(--warning)_55%,var(--border))]',
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <h3 id={titulo} className="truncate text-sm font-[650] text-foreground">
            {tarjeta.titulo}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <ConNumeros texto={tarjeta.ruta} />
          </p>
        </div>
        <BadgeSistema variante={tarjeta.decidido ? 'success' : 'warning'} tamaño="sm" className="shrink-0">
          {tarjeta.decidido ? 'Decidido' : 'Por decidir'}
        </BadgeSistema>
      </div>

      <fieldset className="min-w-0">
        <legend className="block w-full px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground">¿Qué pasa con este grupo?</legend>
        <ul className="min-w-0">
          {tarjeta.opciones.map((opcion) => {
            const id = idOpcion(tarjeta.grupoId, opcion.valor)
            const elegida = tarjeta.decision === opcion.valor
            return (
              <li key={opcion.valor} className="border-t border-border/60 first:border-t-0">
                <label
                  htmlFor={id}
                  className={cn(
                    'flex min-h-14 w-full min-w-0 gap-2.5 px-3 py-2.5 transition-colors',
                    opcion.disponible ? 'cursor-pointer md:hover:bg-accent/50' : 'cursor-not-allowed opacity-70',
                    elegida && 'bg-brand-tint md:hover:bg-brand-tint',
                  )}
                >
                  <input
                    id={id}
                    type="radio"
                    name={`promocion-${tarjeta.grupoId}`}
                    value={opcion.valor}
                    checked={elegida}
                    disabled={!opcion.disponible}
                    onChange={() => onDecidir(tarjeta.grupoId, opcion.valor)}
                    className="focus-ring mt-px size-[18px] shrink-0 accent-[var(--brand-strong)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-foreground">{opcion.titulo}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      <ConNumeros texto={opcion.descripcion} />
                    </span>
                    {opcion.motivo && <span className="mt-1 block text-xs font-medium text-warning-text">{opcion.motivo}</span>}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </fieldset>

      <div aria-live="polite" className="space-y-2 px-3 pb-3 empty:hidden">
        {tarjeta.avisos.map((aviso) => (
          <AvisoPromocion key={aviso.texto} tono={aviso.tono} titulo={aviso.titulo}>
            <p>{aviso.texto}</p>
          </AvisoPromocion>
        ))}
        {tarjeta.nota && <p className="text-[13px] text-muted-foreground">{tarjeta.nota}</p>}
      </div>
    </article>
  )
}
