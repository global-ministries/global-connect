'use client'

import { createContext, useContext, type ReactNode } from 'react'

import { SIN_ACCESO_ESTUDIANTES, type AccesoEstudiantes } from '@/lib/platform/estudiantes/acceso'

/**
 * Estudiantes access facts for the navigation (C4 of
 * odd/tasks/estudiantes-fase-b.md): the groups the user sees, whether they
 * lead one, the live view and group management (estudiantes_acceso()). The
 * (auth) layout computes them once, server-side, and provides them here, like
 * Niños (hooks/useNinosAcceso). Outside the provider there is no access
 * (fails closed).
 */
const EstudiantesAccesoContext = createContext<AccesoEstudiantes>(SIN_ACCESO_ESTUDIANTES)

export function EstudiantesAccesoProvider({
  acceso,
  children,
}: {
  readonly acceso: AccesoEstudiantes
  readonly children: ReactNode
}) {
  return <EstudiantesAccesoContext.Provider value={acceso}>{children}</EstudiantesAccesoContext.Provider>
}

export const useEstudiantesAcceso = (): AccesoEstudiantes => useContext(EstudiantesAccesoContext)
