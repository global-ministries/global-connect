'use client'

import { Phone } from 'lucide-react'

import { BadgeSistema, InputSistema } from '@/components/ui/sistema-diseno'
import { MAX_MOTIVO_RETIRO, type OpcionRetiro } from '@/lib/platform/ninos/retiro'

/** The "Otra persona" choice (anyone outside the list, with a reason). */
export const OTRA = '__otra__'

type Props = {
  opciones: readonly OpcionRetiro[]
  /** The chosen option's name, OTRA, or null. */
  eleccion: string | null
  onElegir: (eleccion: string) => void
  otraNombre: string
  onOtraNombre: (v: string) => void
  motivo: string
  onMotivo: (v: string) => void
}

/** «¿Quién retira?»: the people who may pick up the marked children, or another person with a reason. */
export function QuienRetira({ opciones, eleccion, onElegir, otraNombre, onOtraNombre, motivo, onMotivo }: Props) {
  return (
    <fieldset className="relative min-w-0 space-y-2">
      <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">¿Quién retira?</legend>
      <p className="absolute right-0 top-0 text-xs text-muted-foreground">Mira su etiqueta</p>
      {opciones.length === 0 && (
        <BadgeSistema variante="warning" tamaño="sm">
          Sin personas autorizadas ni representantes registrados.
        </BadgeSistema>
      )}
      {opciones.map((o) => (
        <div
          key={o.nombre}
          className="flex flex-wrap items-center gap-x-3 rounded-md border border-border px-3 transition-colors has-[:checked]:border-brand has-[:checked]:bg-brand-tint"
        >
          <label className="flex min-h-[44px] min-w-0 flex-1 cursor-pointer items-center gap-3 text-sm">
            <input
              type="radio"
              name="retiro-quien"
              value={o.nombre}
              checked={eleccion === o.nombre}
              onChange={() => onElegir(o.nombre)}
              className="size-5 shrink-0 accent-[var(--brand-strong)]"
            />
            <span className="min-w-0">
              <span className="font-medium text-foreground">{o.nombre}</span>
              {o.relacion && <span className="text-muted-foreground"> ({o.relacion})</span>}
            </span>
          </label>
          {o.telefono && (
            <a href={`tel:${o.telefono}`} className="focus-ring inline-flex min-h-[44px] items-center gap-1 rounded-md font-mono text-sm tabular-nums text-brand-text hover:underline">
              <Phone className="h-3 w-3" aria-hidden />
              {o.telefono}
            </a>
          )}
        </div>
      ))}
      <div className="rounded-md border border-dashed border-border px-3 has-[:checked]:border-warning/40 has-[:checked]:bg-warning/10">
        <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm">
          <input
            type="radio"
            name="retiro-quien"
            value={OTRA}
            checked={eleccion === OTRA}
            onChange={() => onElegir(OTRA)}
            className="size-5 shrink-0 accent-[var(--brand-strong)]"
          />
          <span className="font-medium text-foreground">Otra persona</span>
        </label>
        {eleccion === OTRA && (
          <div className="space-y-3 pb-3">
            <p className="text-xs text-muted-foreground">No está en la lista: queda registrado con el motivo.</p>
            <InputSistema
              id="retiro-otra-nombre"
              label="Nombre de quien retira"
              autoComplete="off"
              maxLength={200}
              value={otraNombre}
              onChange={(e) => onOtraNombre(e.target.value)}
            />
            <InputSistema
              id="retiro-motivo"
              label="Motivo"
              placeholder="Ej.: la mamá avisó por teléfono"
              maxLength={MAX_MOTIVO_RETIRO}
              value={motivo}
              onChange={(e) => onMotivo(e.target.value)}
            />
          </div>
        )}
      </div>
    </fieldset>
  )
}
