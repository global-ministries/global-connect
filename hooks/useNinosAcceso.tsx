'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Niños access facts for the navigation (odd/tasks/ninos-checkin.md, N6).
 *
 * `puedeOperar`: ninos_puede_operar_algun_area() — check-in, check-out and
 * Familias. `puedeVerSalon`: ninos_puede_ver_algun_salon() — some room list
 * (operators plus Líderes). The (auth) layout computes both once,
 * server-side, and provides them here. Outside the provider both are false.
 */
export interface NinosAcceso {
  readonly puedeOperar: boolean
  readonly puedeVerSalon: boolean
}

const SIN_ACCESO: NinosAcceso = { puedeOperar: false, puedeVerSalon: false }

const NinosAccesoContext = createContext<NinosAcceso>(SIN_ACCESO)

export function NinosAccesoProvider({
  puedeOperar,
  puedeVerSalon,
  children,
}: NinosAcceso & { readonly children: ReactNode }) {
  return <NinosAccesoContext.Provider value={{ puedeOperar, puedeVerSalon }}>{children}</NinosAccesoContext.Provider>
}

export const useNinosAcceso = (): NinosAcceso => useContext(NinosAccesoContext)
