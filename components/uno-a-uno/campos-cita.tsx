'use client'

/**
 * The "who, when, where" fields shared by the schedule dialog and the
 * register-without-schedule dialog (odd/tasks/uno-a-uno.md, T4). The date and
 * time are Caracas time; the server action turns them into a timestamptz.
 */

import type { ReactElement } from 'react'

import { InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { LIMITES_UNO_A_UNO } from '@/lib/uno-a-uno/errores'
import type { OpcionDirigido } from '@/lib/uno-a-uno/vista'

export interface ValoresCita {
  readonly dirigidoId: string
  readonly fecha: string
  readonly hora: string
  readonly lugar: string
}

export const CITA_VACIA: ValoresCita = { dirigidoId: '', fecha: '', hora: '', lugar: '' }

export function citaCompleta(valores: ValoresCita): boolean {
  return valores.dirigidoId !== '' && valores.fecha !== '' && valores.hora !== ''
}

interface Props {
  readonly dirigidos: readonly OpcionDirigido[]
  readonly valores: ValoresCita
  readonly onChange: (valores: ValoresCita) => void
  /** Bounds for the date input, YYYY-MM-DD (a schedule is future, a log is past). */
  readonly fechaMin?: string
  readonly fechaMax?: string
}

export function CamposCita({ dirigidos, valores, onChange, fechaMin, fechaMax }: Props): ReactElement {
  return (
    <div className="grid gap-4">
      <SelectSistema
        label="¿Con quién?"
        placeholder="Elige a la persona"
        opciones={[...dirigidos]}
        value={valores.dirigidoId}
        onValueChange={(dirigidoId) => onChange({ ...valores, dirigidoId })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <InputSistema
          label="Fecha"
          type="date"
          min={fechaMin}
          max={fechaMax}
          value={valores.fecha}
          onChange={(e) => onChange({ ...valores, fecha: e.target.value })}
        />
        <InputSistema
          label="Hora"
          type="time"
          value={valores.hora}
          onChange={(e) => onChange({ ...valores, hora: e.target.value })}
        />
      </div>
      <InputSistema
        label="Lugar (opcional)"
        value={valores.lugar}
        maxLength={LIMITES_UNO_A_UNO.lugar}
        onChange={(e) => onChange({ ...valores, lugar: e.target.value })}
      />
    </div>
  )
}
