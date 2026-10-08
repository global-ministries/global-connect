'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Dream Team access facts the client cannot derive from the session alone.
 *
 * `puedeRegistrar`: whether the user may register new people / fix fichas in
 * some equipo (dream_team_equipos_registrables, the volunteer coordinator of
 * an area). Their servicio mints no read capability, so the sidebar would not
 * link Mi equipo for them. The (auth) layout computes it once, server-side
 * (puedeRegistrarParaNavegacion), and provides it here. Outside the provider
 * it is false.
 */
interface DreamTeamAcceso {
  readonly puedeRegistrar: boolean
}

const DreamTeamAccesoContext = createContext<DreamTeamAcceso>({ puedeRegistrar: false })

export function DreamTeamAccesoProvider({
  puedeRegistrar,
  children,
}: {
  readonly puedeRegistrar: boolean
  readonly children: ReactNode
}) {
  return <DreamTeamAccesoContext.Provider value={{ puedeRegistrar }}>{children}</DreamTeamAccesoContext.Provider>
}

export const useDreamTeamAcceso = (): DreamTeamAcceso => useContext(DreamTeamAccesoContext)
