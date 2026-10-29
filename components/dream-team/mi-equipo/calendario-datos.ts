/**
 * Mi equipo — the data of the "Calendario" tab (A2 of
 * odd/tasks/tlr-calendario-servicios.md): what GET
 * /api/dream-team/turnos/calendario answers, the routes it writes through and
 * `useCalendarioTurnos`, which loads it for the current scope so the screen
 * knows whether to offer the tab at all. The database decides who may plan
 * (A1); the routes answer a refusal in Spanish.
 */
import { useEffect, useState } from 'react'

import type { useNotificaciones } from '@/hooks/use-notificaciones'
import type { PersonaVista } from '@/lib/platform/dream-team/mi-equipo-vista'
import type { FechaTurno } from '@/lib/platform/dream-team/turno-fechas'

export type Toast = Pick<ReturnType<typeof useNotificaciones>, 'success'>

export interface TurnoCalendario {
  readonly id: string
  readonly nombre: string
  readonly hora: string
  readonly puedeGestionar: boolean
  readonly fechas: readonly FechaTurno[]
}

export interface Asignado {
  readonly servicioId: string
  readonly nombre: string
  readonly detalle: string
}

export async function leerError(respuesta: Response, porDefecto: string): Promise<string> {
  try {
    const cuerpo = (await respuesta.json()) as { error?: unknown }
    return typeof cuerpo.error === 'string' ? cuerpo.error : porDefecto
  } catch {
    return porDefecto
  }
}

export const urlFechas = (turnoId: string): string => `/api/dream-team/turnos/${encodeURIComponent(turnoId)}/fechas`
export const urlFecha = (turnoId: string, fechaId: string): string => `${urlFechas(turnoId)}/${encodeURIComponent(fechaId)}`

/** The servicios of the scope assigned to the shift, once each. */
export function asignadosDe(personas: readonly PersonaVista[], turnoId: string): Asignado[] {
  const vistos = new Set<string>()
  const asignados: Asignado[] = []
  for (const persona of personas) {
    const servicioId = persona.servicioId
    if (persona.origen !== 'dream_team' || !servicioId || vistos.has(servicioId)) continue
    if (!persona.turnoIds?.includes(turnoId)) continue
    vistos.add(servicioId)
    asignados.push({ servicioId, nombre: persona.nombre, detalle: `${persona.rolLabel} · ${persona.equipoLabel}` })
  }
  return asignados
}

export interface CalendarioCargado {
  /** `null` while loading (or when disabled); empty when the scope serves no dated shift. */
  readonly turnos: readonly TurnoCalendario[] | null
  readonly recargar: () => void
}

/**
 * Loads the dated shifts the equipo serves, only when the campus has any
 * (`habilitado`): without them nothing is asked. A failure leaves the
 * calendar empty — a convenience on top of the list, as the contacts.
 */
export function useCalendarioTurnos(equipoId: string, habilitado: boolean): CalendarioCargado {
  const [estado, setEstado] = useState<{ readonly equipoId: string; readonly turnos: readonly TurnoCalendario[] } | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!habilitado) return
    let vigente = true
    void (async () => {
      try {
        const respuesta = await fetch(`/api/dream-team/turnos/calendario?equipoId=${encodeURIComponent(equipoId)}`, {
          cache: 'no-store',
        })
        if (!respuesta.ok) throw new Error(await leerError(respuesta, 'No se pudo cargar el calendario.'))
        const cuerpo = (await respuesta.json()) as { turnos?: TurnoCalendario[] }
        if (vigente) setEstado({ equipoId, turnos: cuerpo.turnos ?? [] })
      } catch (error) {
        console.error('[dream-team/mi-equipo] calendario', error)
        if (vigente) setEstado({ equipoId, turnos: [] })
      }
    })()
    return () => {
      vigente = false
    }
  }, [equipoId, habilitado, version])

  return {
    // An answer for another scope is not this scope's calendar.
    turnos: habilitado && estado?.equipoId === equipoId ? estado.turnos : null,
    recargar: () => setVersion((v) => v + 1),
  }
}
