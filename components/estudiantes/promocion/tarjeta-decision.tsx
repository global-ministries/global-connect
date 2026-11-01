'use client'

/**
 * Estudiantes › Promover temporada — one decision card per last-Transit-year
 * group (S12, artboards 09 / 10 `.s-card.decision`): the group, "Por decidir"
 * / "Decidido", and a single-choice list of the two options with a sentence
 * of consequence each (gap GP1, `ListaOpciones`, composed here as a
 * `fieldset` of native radios on the inset list surface). An option Inside
 * Out cannot take is disabled with its reason. The notices of the chosen
 * option are announced politely.
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
    <article id={idDecision(tarjeta.grupoId)} aria-labelledby={titulo} className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-4 md:p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={titulo} className="truncate text-[17px] font-semibold text-foreground">
            {tarjeta.titulo}
          </h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            <ConNumeros texto={tarjeta.ruta} />
          </p>
        </div>
        <BadgeSistema variante={tarjeta.decidido ? 'success' : 'warning'} tamaño="sm" className="shrink-0">
          {tarjeta.decidido ? 'Decidido' : 'Por decidir'}
        </BadgeSistema>
      </div>

      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-medium text-foreground">¿Qué pasa con este grupo?</legend>
        <ul className="min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card">
          {tarjeta.opciones.map((opcion) => {
            const id = idOpcion(tarjeta.grupoId, opcion.valor)
            const elegida = tarjeta.decision === opcion.valor
            return (
              <li key={opcion.valor} className="relative before:absolute before:top-0 before:right-0 before:left-12 before:h-px before:bg-border/60 first:before:hidden">
                <label
                  htmlFor={id}
                  className={cn(
                    'flex min-h-[52px] w-full min-w-0 gap-3 px-3.5 py-3 transition-colors',
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
                    className="focus-ring mt-0.5 size-5 shrink-0 accent-[var(--brand-strong)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-foreground">{opcion.titulo}</span>
                    <span className="mt-0.5 block text-[13px] text-muted-foreground">
                      <ConNumeros texto={opcion.descripcion} />
                    </span>
                    {opcion.motivo && <span className="mt-1 block text-[13px] font-medium text-warning-text">{opcion.motivo}</span>}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </fieldset>

      <div aria-live="polite" className="space-y-3 empty:hidden">
        {tarjeta.avisos.map((aviso) => (
          <AvisoPromocion key={aviso.texto} tono={aviso.tono} titulo={aviso.titulo}>
            <p>{aviso.texto}</p>
          </AvisoPromocion>
        ))}
        {tarjeta.nota && <p className="text-sm text-muted-foreground">{tarjeta.nota}</p>}
      </div>
    </article>
  )
}
