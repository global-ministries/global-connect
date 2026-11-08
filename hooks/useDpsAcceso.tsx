'use client'

import { createContext, useContext, type ReactNode } from 'react'

import { SIN_ACCESO_DPS, type DpsAcceso } from '@/lib/platform/dps/acceso'

/**
 * DPS access facts for the navigation (odd/tasks/dps-asistencia-pco.md, T9):
 * dps_puede_ver / dps_puede_planificar (resolverDpsAcceso). The (auth) layout
 * computes them once, server-side, and provides them here, like Niños and
 * Estudiantes (hooks/useEstudiantesAcceso). Outside the provider there is no
 * access (fails closed).
 */
const DpsAccesoContext = createContext<DpsAcceso>(SIN_ACCESO_DPS)

export function DpsAccesoProvider({ acceso, children }: { readonly acceso: DpsAcceso; readonly children: ReactNode }) {
  return <DpsAccesoContext.Provider value={acceso}>{children}</DpsAccesoContext.Provider>
}

export const useDpsAcceso = (): DpsAcceso => useContext(DpsAccesoContext)
