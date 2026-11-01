'use client'

/**
 * Estudiantes › En vivo — the refresh loop of the live view (A5 of
 * design/estudiantes-asistencia: every 15 s). It calls the server action
 * (lib/actions/estudiantes-vivo.actions.ts) and swaps the data in place, so
 * the filters, the scroll and an open drawer stay. It pauses while the tab is
 * hidden and refreshes at once when it comes back; a failed refresh keeps the
 * last data and retries on the next tick (G4: the indicator goes muted). New
 * visitors since the previous refresh go to `onNuevos` (the toast, Q5); the
 * first load announces nothing.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { refrescarVivo } from '@/lib/actions/estudiantes-vivo.actions'
import type { DatosVivo, OpcionVivo, VisitanteHoy } from '@/lib/platform/estudiantes/vivo-datos'
import { nuevosVisitantes } from '@/lib/platform/estudiantes/vivo-vista'

export const INTERVALO_VIVO_MS = 15_000

const oculta = (): boolean => typeof document !== 'undefined' && document.visibilityState === 'hidden'

export interface EstadoEnVivo {
  readonly datos: DatosVivo | null
  /** Epoch ms of the last data (the page load or the last good refresh). */
  readonly actualizadoAt: number
  readonly oculto: boolean
  readonly fallo: boolean
  /** The message of the last failed refresh. */
  readonly mensaje: string | null
}

export function useEnVivo({
  opcion,
  inicial,
  errorInicial = null,
  onNuevos,
  intervaloMs = INTERVALO_VIVO_MS,
}: {
  readonly opcion: OpcionVivo
  readonly inicial: DatosVivo | null
  readonly errorInicial?: string | null
  readonly onNuevos: (nuevos: readonly VisitanteHoy[]) => void
  readonly intervaloMs?: number
}): EstadoEnVivo {
  const [estado, setEstado] = useState<EstadoEnVivo>(() => ({
    datos: inicial,
    actualizadoAt: Date.now(),
    oculto: oculta(),
    fallo: inicial === null,
    mensaje: errorInicial,
  }))
  const enCurso = useRef(false)
  const previos = useRef<readonly VisitanteHoy[] | null>(inicial?.visitantesHoy ?? null)
  const avisar = useRef(onNuevos)
  useEffect(() => {
    avisar.current = onNuevos
  }, [onNuevos])

  const { ambitoId, fecha, turnoId } = opcion
  const refrescar = useCallback(async (): Promise<void> => {
    if (enCurso.current || oculta()) return
    enCurso.current = true
    try {
      const r = await refrescarVivo({ ambitoId, fecha, turnoId })
      if (!r.ok) {
        setEstado((actual) => ({ ...actual, fallo: true, mensaje: r.message }))
        return
      }
      const nuevos = nuevosVisitantes(previos.current, r.data.visitantesHoy)
      previos.current = r.data.visitantesHoy
      setEstado((actual) => ({ ...actual, datos: r.data, actualizadoAt: Date.now(), fallo: false, mensaje: null }))
      if (nuevos.length > 0) avisar.current(nuevos)
    } catch {
      setEstado((actual) => ({ ...actual, fallo: true, mensaje: 'Sin conexión. Se reintenta sola.' }))
    } finally {
      enCurso.current = false
    }
  }, [ambitoId, fecha, turnoId])

  useEffect(() => {
    const id = window.setInterval(() => void refrescar(), intervaloMs)
    const alCambiarVisibilidad = (): void => {
      const ahoraOculta = oculta()
      setEstado((actual) => (actual.oculto === ahoraOculta ? actual : { ...actual, oculto: ahoraOculta }))
      if (!ahoraOculta) void refrescar()
    }
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    }
  }, [refrescar, intervaloMs])

  return estado
}
