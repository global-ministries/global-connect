import { DREAM_TEAM_MOTIVOS } from './types'
import { dreamTeamError, TERMINAL_ESTADOS } from './errors'
import type { DreamTeamEstado, DreamTeamTransicionInput, DreamTeamTransicionResult } from './types'

export const TRANSICIONES_VALIDAS: Readonly<Record<DreamTeamEstado, ReadonlySet<DreamTeamEstado>>> = {
  postulado: new Set(['en_orientacion', 'retirado'] as const),
  en_orientacion: new Set(['activo', 'inactivo', 'retirado'] as const),
  activo: new Set(['en_pausa', 'inactivo', 'retirado'] as const),
  en_pausa: new Set(['activo', 'inactivo', 'retirado'] as const),
  inactivo: new Set(['postulado', 'retirado'] as const),
  retirado: new Set([] as const),
}

export function transition(input: DreamTeamTransicionInput): DreamTeamTransicionResult {
  const { servicio, estadoNuevo, motivo, fecha } = input

  if (!motivo.trim()) {
    return { ok: false, error: dreamTeamError('MISSING_MOTIVO', 'motivo is required', { motivo }) }
  }

  if (!DREAM_TEAM_MOTIVOS.includes(motivo)) {
    return { ok: false, error: dreamTeamError('INVALID_MOTIVO_FOR_TRANSITION', `motivo ${motivo} is not valid`, { motivo }) }
  }

  if (TERMINAL_ESTADOS.has(servicio.estado)) {
    return { ok: false, error: dreamTeamError('TERMINAL_STATE', 'cannot transition from terminal state', { estado: servicio.estado }) }
  }

  if (estadoNuevo === servicio.estado) {
    return { ok: false, error: dreamTeamError('SELF_TRANSITION', 'self transition is not allowed', { estado: servicio.estado }) }
  }

  if (!TRANSICIONES_VALIDAS[servicio.estado].has(estadoNuevo)) {
    return { ok: false, error: dreamTeamError('INVALID_STATE_TRANSITION', 'transition is not valid', { from: servicio.estado, to: estadoNuevo }) }
  }

  return {
    ok: true,
    servicioNuevo: {
      ...servicio,
      estado: estadoNuevo,
      motivoActual: motivo,
      version: servicio.version + 1,
      fechaFin: estadoNuevo === 'retirado' ? fecha : servicio.fechaFin,
    },
  }
}
