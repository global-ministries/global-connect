/**
 * Estudiantes — the marks of a planning style attendance row
 * (odd/tasks/estudiantes-estilo-dps.md S5; B13 and B33 of
 * design/estudiantes-dps/README-tanda-a.md):
 *
 * - `MarcaTexto`: gap EA1, the written secondary mark next to the circle
 *   («Ausente», «Avisó», «Faltó»), the same shape as "No viene" of
 *   /dps/asistencia: 13px text, `aria-pressed`, pressed = the tone's tint
 *   and readable text. 36px, 44px to the touch.
 * - `MarcasFila`: the group "Asistencia de <nombre>" with the text marks
 *   and the big `MarcaLlegada` circle (named "Presente: <nombre>") at the
 *   end. The caller makes them exclusive and clears the active one on a
 *   second tap.
 * Server-safe.
 */
import type { ReactElement } from 'react'

import { MarcaLlegada } from '@/components/dps/marca-llegada'
import { cn } from '@/lib/utils'

const TINTE = {
  warning: 'bg-warning/15 text-warning-text',
  danger: 'bg-danger/15 text-danger-text',
} as const

export interface MarcaTextoProps {
  readonly texto: string
  /** The person's name, for the accessible name "Ausente: <nombre>". */
  readonly nombre: string
  readonly tono: keyof typeof TINTE
  readonly activa: boolean
  readonly deshabilitada?: boolean
  readonly onClick: () => void
}

export function MarcaTexto({ texto, nombre, tono, activa, deshabilitada = false, onClick }: MarcaTextoProps): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={activa}
      aria-label={`${texto}: ${nombre}`}
      disabled={deshabilitada}
      onClick={onClick}
      className={cn(
        'focus-ring min-h-9 shrink-0 touch-manipulation rounded-md px-2 text-[13px] font-medium transition-colors pointer-coarse:min-h-11 disabled:cursor-not-allowed disabled:opacity-60',
        activa ? TINTE[tono] : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {texto}
    </button>
  )
}

export interface MarcaSecundaria {
  readonly texto: string
  readonly tono: keyof typeof TINTE
  readonly activa: boolean
  readonly onClick: () => void
}

export interface MarcasFilaProps {
  readonly nombre: string
  readonly secundarias: readonly MarcaSecundaria[]
  readonly presente: boolean
  readonly onPresente: () => void
  readonly deshabilitadas?: boolean
  /** `data-marca` of the circle: where the focus goes back after a change. */
  readonly clave?: string
}

export function MarcasFila({ nombre, secundarias, presente, onPresente, deshabilitadas = false, clave }: MarcasFilaProps): ReactElement {
  return (
    <div role="group" aria-label={`Asistencia de ${nombre}`} className="relative z-10 flex shrink-0 items-center justify-end gap-0.5">
      {secundarias.map((m) => (
        <MarcaTexto key={m.texto} texto={m.texto} nombre={nombre} tono={m.tono} activa={m.activa} deshabilitada={deshabilitadas} onClick={m.onClick} />
      ))}
      <MarcaLlegada nombre={nombre} llego={presente} aria-label={`Presente: ${nombre}`} disabled={deshabilitadas} onClick={onPresente} data-marca={clave} />
    </div>
  )
}
