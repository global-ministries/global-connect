'use client'

/**
 * Personas — «¿Es alguna de estas personas?» (T4, S6b of
 * odd/tasks/dream-team-estructura-correcciones.md).
 *
 * Shown before registering a new person when someone already in the system
 * looks like them (GET /api/dream-team/usuarios/posibles-duplicados). Each
 * match shows its short name, campus, how many servicios it has, whether it
 * has an account and why it matched, with «Usar esta persona». «No, es otra
 * persona, crear» goes on: the check never blocks a registration.
 */
import { useId, type ReactElement } from 'react'

import { BotonSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { textoCoincidencia, type PosibleDuplicado } from '@/lib/platform/personas/posibles-duplicados'

export interface PosiblesDuplicadosProps {
  readonly personas: readonly PosibleDuplicado[]
  readonly onUsar: (persona: PosibleDuplicado) => void
  readonly onCrear: () => void
}

function detalle(p: PosibleDuplicado): string {
  const servicios = p.servicios === 0 ? 'Sin servicios' : p.servicios === 1 ? '1 servicio' : `${p.servicios} servicios`
  return [p.campus ?? 'Sin campus', servicios, p.tieneCuenta ? 'Con cuenta' : 'Sin cuenta'].join(' · ')
}

export function PosiblesDuplicados({ personas, onUsar, onCrear }: PosiblesDuplicadosProps): ReactElement {
  const tituloId = useId()
  return (
    <section aria-labelledby={tituloId} className="grid gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3">
      <div className="grid gap-1">
        <h4 id={tituloId} className="text-sm font-semibold">
          ¿Es alguna de estas personas?
        </h4>
        <TextoSistema variante="sutil" tamaño="sm">
          Ya hay personas parecidas. Si es una de ellas, úsala en vez de crearla otra vez.
        </TextoSistema>
      </div>
      <ul className="rounded-xl border border-border bg-background">
        {personas.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 last:border-b-0"
          >
            <div className="grid min-w-0 gap-0.5">
              <span className="truncate text-sm font-medium">{p.nombreCorto}</span>
              <span className="text-xs text-muted-foreground">{detalle(p)}</span>
              {p.coincide.length > 0 && <span className="text-xs text-warning-text">{textoCoincidencia(p.coincide)}</span>}
            </div>
            <BotonSistema
              type="button"
              variante="outline"
              tamaño="sm"
              aria-label={`Usar esta persona: ${p.nombreCorto}`}
              onClick={() => onUsar(p)}
            >
              Usar esta persona
            </BotonSistema>
          </li>
        ))}
      </ul>
      <BotonSistema type="button" variante="ghost" tamaño="sm" className="justify-self-start" onClick={onCrear}>
        No, es otra persona, crear
      </BotonSistema>
    </section>
  )
}
