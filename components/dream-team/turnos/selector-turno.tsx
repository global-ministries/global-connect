'use client'

/**
 * The "Turno" filter shared by Servidores and Mi equipo: every campus shift,
 * plus "Sin turno" for the servicios nobody has placed in a shift yet.
 * Renders nothing while no campus has shifts.
 */
import type { ReactElement } from 'react'

import { SelectSistema } from '@/components/ui/sistema-diseno'
import { SIN_TURNO } from '@/lib/platform/dream-team/turnos'

const TODOS = ''

export interface SelectorTurnoProps {
  readonly turnos: readonly { readonly id: string; readonly label: string }[]
  readonly valor: string | null
  readonly onCambio: (turno: string | null) => void
}

export function SelectorTurno({ turnos, valor, onCambio }: SelectorTurnoProps): ReactElement | null {
  if (turnos.length === 0) return null
  return (
    <SelectSistema
      label="Turno"
      opciones={[
        { valor: TODOS, etiqueta: 'Todos' },
        ...turnos.map((turno) => ({ valor: turno.id, etiqueta: turno.label })),
        { valor: SIN_TURNO, etiqueta: 'Sin turno' },
      ]}
      value={valor ?? TODOS}
      onValueChange={(siguiente) => onCambio(siguiente === TODOS ? null : siguiente)}
    />
  )
}
