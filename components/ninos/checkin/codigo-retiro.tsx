/**
 * Niños › Check-in — the pickup code after "Llegaron" or "Registrar ingreso"
 * (prototype 01 `.codigo`): the code very large, one line per child with its
 * salón, the "Salón lleno" warnings (the check-in is already saved: warn,
 * never block), who may pick up, and "Siguiente familia".
 */
import type { ReactElement, Ref } from 'react'
import { AlertTriangle, Check } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import type { PersonaRetiro } from '@/lib/platform/ninos/checkin-vista'

import { PistaTecla, PuedenRetirar } from './partes'

export type ResultadoIngreso = {
  codigo: string
  lineas: { ninoId: string; nombre: string; detalle: string }[]
  avisos: string[]
  retiran: PersonaRetiro[]
}

export interface CodigoRetiroProps {
  readonly resultado: ResultadoIngreso
  readonly onSiguiente: () => void
  /** "Siguiente familia", focused when the code shows (desktop keyboard flow). */
  readonly refSiguiente?: Ref<HTMLButtonElement>
}

export function CodigoRetiro({ resultado, onSiguiente, refSiguiente }: CodigoRetiroProps): ReactElement {
  return (
    <div role="region" aria-label="Ingreso registrado" aria-live="polite" className="grid min-w-0 gap-3.5 text-center">
      <div className="grid gap-2 rounded-2xl border-2 border-brand bg-[var(--brand-accent)] px-3 py-4.5">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Código de retiro</p>
        <p className="break-all font-mono text-7xl font-bold lg:text-[88px] leading-none tracking-[0.08em] tabular-nums text-foreground">{resultado.codigo}</p>
        <p className="text-[15px] text-muted-foreground">
          Escríbelo en las <b className="font-semibold text-foreground">dos etiquetas</b>: la del niño y la del representante.
        </p>
      </div>

      <ul aria-label="Niños registrados" className="min-w-0 rounded-xl border border-border text-left">
        {resultado.lineas.map((l) => (
          <li key={l.ninoId} className="flex min-h-12 min-w-0 items-center gap-2.5 px-3 py-2 text-[15px] [&+li]:border-t [&+li]:border-border/60">
            <Check aria-hidden="true" className="size-[18px] shrink-0 text-success-text" strokeWidth={2.4} />
            <span className="min-w-0 flex-1">
              <b className="block truncate font-semibold text-foreground">{l.nombre}</b>
              <small className="block text-[13px] text-muted-foreground">{l.detalle}</small>
            </span>
          </li>
        ))}
      </ul>

      {resultado.avisos.map((a) => (
        <div key={a} role="alert" className="flex min-w-0 items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-3 text-left text-sm">
          <AlertTriangle aria-hidden="true" className="mt-px size-[18px] shrink-0 text-warning-text" />
          <div className="min-w-0">
            <b className="font-semibold text-foreground">{a}</b>
            <p className="mt-0.5 text-muted-foreground">Avisa a la coordinación del salón.</p>
          </div>
        </div>
      ))}

      <PuedenRetirar personas={resultado.retiran} />

      <BotonSistema ref={refSiguiente} type="button" tamaño="lg" className="w-full" onClick={onSiguiente}>
        Siguiente familia
      </BotonSistema>
      <PistaTecla tecla="Enter" texto="siguiente familia" />
    </div>
  )
}
