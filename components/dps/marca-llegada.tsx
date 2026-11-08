/**
 * DPS — the arrival toggle of a person row (planned `MarcaLlegada` of
 * docs/design-system/components.md#planning-style-components, `.ck` of
 * prototipos/planificacion-dps/05-asistencia-celular.html; local here until it
 * moves to components/ui). One big round toggle: a 30px circle with a 2px
 * border in a 44px target, `aria-pressed`, named "Llegó: <nombre>"; pressed =
 * `success` fill with a check. One tap saves, a second undoes.
 */
import type { ButtonHTMLAttributes, ReactElement } from 'react'
import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface MarcaLlegadaProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed' | 'children'> {
  readonly nombre: string
  readonly llego: boolean
}

export function MarcaLlegada({ nombre, llego, className, ...props }: MarcaLlegadaProps): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={llego}
      aria-label={`Llegó: ${nombre}`}
      className={cn(
        'focus-ring group grid size-11 shrink-0 touch-manipulation place-items-center rounded-full disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid size-[30px] place-items-center rounded-full border-2 transition-[background-color,border-color,transform] duration-150 ease-[var(--ease-expo)] group-active:scale-[.92] motion-reduce:transition-none',
          llego ? 'border-success bg-success text-card' : 'border-border text-transparent',
        )}
      >
        <Check className="size-4" strokeWidth={2.5} />
      </span>
    </button>
  )
}
