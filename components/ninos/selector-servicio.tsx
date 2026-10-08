'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Servicio, TurnoFila } from '@/lib/platform/ninos/checkin'

import { SELECT_CLASS } from './campos-nino'

type Props = {
  idPrefijo: string
  turnos: TurnoFila[]
  servicio: Servicio
  onCambiar: (s: Servicio) => void
}

/** The service (Sunday turno + date) picker shared by check-in and the room list. */
export function SelectorServicio({ idPrefijo, turnos, servicio, onCambiar }: Props) {
  return (
    <>
      <section className="grid grid-cols-2 gap-2" aria-label="Servicio elegido">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefijo}-turno`}>Servicio</Label>
          <select
            id={`${idPrefijo}-turno`}
            className={SELECT_CLASS}
            value={servicio.turnoId ?? ''}
            onChange={(e) => onCambiar({ ...servicio, turnoId: e.target.value || null })}
          >
            {turnos.length === 0 && <option value="">Sin servicios</option>}
            {turnos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefijo}-fecha`}>Fecha</Label>
          <Input
            id={`${idPrefijo}-fecha`}
            type="date"
            className="h-11"
            value={servicio.fecha}
            onChange={(e) => e.target.value && onCambiar({ ...servicio, fecha: e.target.value })}
          />
        </div>
      </section>
      {!servicio.turnoId && (
        <p role="alert" className="text-sm text-destructive">
          No hay servicios configurados para tu campus.
        </p>
      )}
    </>
  )
}
