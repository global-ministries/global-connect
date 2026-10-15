'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Whether the user leads someone (odd/tasks/uno-a-uno.md, T4): mis_dirigidos()
 * has at least one row. The (auth) layout computes it once, server-side, and
 * provides it here so the menu shows "Mis 1 a 1". Outside the provider it is
 * false (fails closed).
 */
const UnoAUnoAccesoContext = createContext<boolean>(false)

export function UnoAUnoAccesoProvider({
  lideraAAlguien,
  children,
}: {
  readonly lideraAAlguien: boolean
  readonly children: ReactNode
}) {
  return <UnoAUnoAccesoContext.Provider value={lideraAAlguien}>{children}</UnoAUnoAccesoContext.Provider>
}

export const useUnoAUnoAcceso = (): boolean => useContext(UnoAUnoAccesoContext)
