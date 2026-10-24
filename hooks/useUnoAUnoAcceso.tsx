'use client'

import { createContext, useContext, type ReactNode } from 'react'

import { SIN_ACCESO_UNO_A_UNO, type AccesoUnoAUno } from '@/lib/uno-a-uno/acceso'

/**
 * What the user does with 1:1s (odd/tasks/uno-a-uno.md, T4/T7): leads
 * someone, supervises a chain, takes part in one (uno_a_uno_acceso()). The
 * (auth) layout computes it once, server-side, and provides it here so the
 * menu shows "Mis 1 a 1". Outside the provider every flag is false (fails
 * closed).
 */
const UnoAUnoAccesoContext = createContext<AccesoUnoAUno>(SIN_ACCESO_UNO_A_UNO)

export function UnoAUnoAccesoProvider({
  acceso,
  children,
}: {
  readonly acceso: AccesoUnoAUno
  readonly children: ReactNode
}) {
  return <UnoAUnoAccesoContext.Provider value={acceso}>{children}</UnoAUnoAccesoContext.Provider>
}

export const useUnoAUnoAcceso = (): AccesoUnoAUno => useContext(UnoAUnoAccesoContext)
