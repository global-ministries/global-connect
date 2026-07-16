/**
 * Operating Core 6-state registration state machine.
 * Pattern reference: dream-team/state-machine.ts (read-only).
 */

export const REGISTRATION_STATES = [
  'pendiente',
  'confirmada',
  'asistida',
  'no_asistio',
  'cancelada',
  'rechazada',
] as const

export type RegistrationState = (typeof REGISTRATION_STATES)[number]

/** Explicit transition table: from → set of valid to-states. */
export const REGISTRATION_TRANSITIONS: Readonly<
  Record<RegistrationState, ReadonlySet<RegistrationState>>
> = {
  pendiente: new Set(['confirmada', 'cancelada', 'rechazada'] as const),
  confirmada: new Set(['asistida', 'no_asistio', 'cancelada'] as const),
  asistida: new Set([] as const),
  no_asistio: new Set([] as const),
  cancelada: new Set([] as const),
  rechazada: new Set([] as const),
}

/**
 * Returns true if a transition from `from` to `to` is valid per the closed state machine.
 * Self-transitions are always invalid.
 */
export function canTransition(from: RegistrationState, to: RegistrationState): boolean {
  if (from === to) return false
  return REGISTRATION_TRANSITIONS[from].has(to)
}
