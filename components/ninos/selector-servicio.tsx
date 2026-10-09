'use client'

import { InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import type { Servicio, TurnoFila } from '@/lib/platform/ninos/checkin'

type Props = {
  idPrefijo: string
  turnos: TurnoFila[]
  servicio: Servicio
  onCambiar: (s: Servicio) => void
}

/** The service (Sunday turno + date) picker shared by check-in and the room list. */
export function SelectorServicio({ idPrefijo, turnos, servicio, onCambiar }: Props) {
  const opciones = turnos.length === 0 ? [{ valor: '', etiqueta: 'Sin servicios' }] : turnos.map((t) => ({ valor: t.id, etiqueta: t.nombre }))
  return (
    <>
      <section className="grid grid-cols-2 gap-3" aria-label="Servicio elegido">
        <SelectSistema
          id={`${idPrefijo}-turno`}
          label="Servicio"
          opciones={opciones}
          value={servicio.turnoId ?? ''}
          onValueChange={(v) => onCambiar({ ...servicio, turnoId: v || null })}
        />
        <InputSistema
          id={`${idPrefijo}-fecha`}
          label="Fecha"
          type="date"
          value={servicio.fecha}
          onChange={(e) => e.target.value && onCambiar({ ...servicio, fecha: e.target.value })}
        />
      </section>
      {!servicio.turnoId && (
        <p role="alert" className="text-sm text-red-500 dark:text-red-400">
          No hay servicios configurados para tu campus.
        </p>
      )}
    </>
  )
}
