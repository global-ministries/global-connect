'use client'

/**
 * Niños › Check-in — the event and horario of the chosen service with its
 * window (odd/tasks/ninos-checkin-pco.md, T2d, S5; artboard 05 `.tb`
 * «Abierto · cierra en 47 min»): «Domingo semanal · 9:00 · Abierto · cierra
 * en 47 min», «Cerrado · abre a las 7:00» or «Cerrado». It only informs: the
 * desk can still check in when it is closed. The window is the horario's
 * abre / cierra minutes around the turno hour (120 / 120 without a horario)
 * and refreshes every 30 seconds. Composed from PuntoEstado and the tokens.
 */
import { useEffect, useState, type ReactElement } from 'react'
import { CalendarDays } from 'lucide-react'

import { PuntoEstado } from '@/components/ui/punto-estado'
import type { TurnoFila } from '@/lib/platform/ninos/checkin'
import {
  estadoVentana,
  horaCorta,
  textoVentana,
  VENTANA_POR_DEFECTO,
  ventanaDelHorario,
  type HorarioMesa,
} from '@/lib/platform/ninos/mesa-reglas'

export interface VentanaHorarioProps {
  readonly turno: TurnoFila | undefined
  readonly fecha: string
  readonly horario: HorarioMesa | undefined
  /** Fixed instant (ms) for tests; without it, the clock every 30 seconds. */
  readonly ahora?: number
}

const REFRESCO_MS = 30_000

export function VentanaHorario({ turno, fecha, horario, ahora: ahoraFijo }: VentanaHorarioProps): ReactElement | null {
  // Read after mount so the server render and the first client render match.
  const [reloj, setReloj] = useState<number | null>(null)
  useEffect(() => {
    if (ahoraFijo !== undefined) return
    const leer = () => setReloj(Date.now())
    const primero = window.setTimeout(leer, 0)
    const id = window.setInterval(leer, REFRESCO_MS)
    return () => {
      window.clearTimeout(primero)
      window.clearInterval(id)
    }
  }, [ahoraFijo])

  if (!turno) return null
  const ahora = ahoraFijo ?? reloj
  const ventana = ventanaDelHorario(
    fecha,
    turno.hora,
    horario?.abreMinAntes ?? VENTANA_POR_DEFECTO,
    horario?.cierraMinDespues ?? VENTANA_POR_DEFECTO,
  )
  const estado = ahora === null ? null : estadoVentana(ventana, ahora)
  const texto = estado ? textoVentana(ventana, estado) : null

  return (
    <p
      role="status"
      aria-label="Horario del check-in"
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground"
    >
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 truncate">
          {horario?.evento && <b className="font-medium text-foreground">{horario.evento} · </b>}
          <span className="font-mono tabular-nums">{horaCorta(turno.hora)}</span>
        </span>
      </span>
      {texto && estado && (
        <PuntoEstado
          tono={estado.estado === 'abierto' ? 'success' : 'muted'}
          etiqueta={texto.detalle ? `${texto.titulo} · ${texto.detalle}` : texto.titulo}
          className="text-foreground"
        />
      )}
    </p>
  )
}
