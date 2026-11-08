'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { SIN_ACCESO_DPS, type DpsAcceso } from '@/lib/platform/dream-team/dps/acceso'

/**
 * Dream Team access facts the client cannot derive from the session alone.
 *
 * `puedeRegistrar`: whether the user may register new people / fix fichas in
 * some equipo (dream_team_equipos_registrables, the volunteer coordinator of
 * an area). Their servicio mints no read capability, so the sidebar would not
 * link Mi equipo for them. The (auth) layout computes it once, server-side
 * (puedeRegistrarParaNavegacion), and provides it here. Outside the provider
 * it is false.
 *
 * The "Pendientes" urgentes count (odd/tasks/dream-team-pendientes-director.md,
 * T4) of the menu badge: read ONCE on the client, after mount, from GET
 * /api/dream-team/pendientes, and only when a menu that shows Pendientes asks
 * for it (useUrgentesPendientes), so the layout never waits for it. `null`
 * until it arrives and on any error. The Pendientes page and the Mi equipo
 * strip hand it the fresh count they already read (useFijarUrgentesPendientes).
 *
 * `dps`: dps_puede_ver / dps_puede_planificar for the DPS planning entries
 * (odd/tasks/dps-asistencia-pco.md, T9), resolved by the same layout
 * (resolverDpsAcceso). Outside the provider, or when omitted, no access.
 */
interface DreamTeamAcceso {
  readonly puedeRegistrar: boolean
  readonly dps: DpsAcceso
  readonly urgentes: number | null
  readonly cargarUrgentes: () => void
  readonly fijarUrgentes: (urgentes: number | null) => void
}

const sinEfecto = (): void => undefined
const DreamTeamAccesoContext = createContext<DreamTeamAcceso>({
  puedeRegistrar: false,
  dps: SIN_ACCESO_DPS,
  urgentes: null,
  cargarUrgentes: sinEfecto,
  fijarUrgentes: sinEfecto,
})

const URL_URGENTES = '/api/dream-team/pendientes'

async function leerUrgentes(): Promise<number | null> {
  try {
    const res = await fetch(URL_URGENTES, { cache: 'no-store' })
    if (!res.ok) return null
    const { urgentes } = (await res.json()) as { urgentes?: unknown }
    return typeof urgentes === 'number' && Number.isInteger(urgentes) && urgentes >= 0 ? urgentes : null
  } catch {
    return null
  }
}

export function DreamTeamAccesoProvider({
  puedeRegistrar,
  dps = SIN_ACCESO_DPS,
  children,
}: {
  readonly puedeRegistrar: boolean
  readonly dps?: DpsAcceso
  readonly children: ReactNode
}) {
  const [urgentes, setUrgentes] = useState<number | null>(null)
  const pedido = useRef(false)
  const montado = useRef(true)
  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
    }
  }, [])

  const cargarUrgentes = useCallback(() => {
    if (pedido.current) return
    pedido.current = true
    void leerUrgentes().then((valor) => {
      if (montado.current && valor !== null) setUrgentes(valor)
    })
  }, [])
  const fijarUrgentes = useCallback((valor: number | null) => {
    if (valor === null) return
    pedido.current = true
    setUrgentes(valor)
  }, [])

  // A new object per render from the layout would re-render every consumer.
  const { ver: dpsVer, planificar: dpsPlanificar } = dps
  const valor = useMemo(
    () => ({ puedeRegistrar, dps: { ver: dpsVer, planificar: dpsPlanificar }, urgentes, cargarUrgentes, fijarUrgentes }),
    [puedeRegistrar, dpsVer, dpsPlanificar, urgentes, cargarUrgentes, fijarUrgentes],
  )
  return <DreamTeamAccesoContext.Provider value={valor}>{children}</DreamTeamAccesoContext.Provider>
}

export const useDreamTeamAcceso = (): DreamTeamAcceso => useContext(DreamTeamAccesoContext)

/** The urgentes of the badge; asks for them once when `activo` (the viewer sees Pendientes). */
export function useUrgentesPendientes(activo: boolean): number | null {
  const { urgentes, cargarUrgentes } = useDreamTeamAcceso()
  useEffect(() => {
    if (activo) cargarUrgentes()
  }, [activo, cargarUrgentes])
  return activo ? urgentes : null
}

/** Hands the badge the count a page already read (`null`: leave it as it is). */
export function useFijarUrgentesPendientes(urgentes: number | null): void {
  const { fijarUrgentes } = useDreamTeamAcceso()
  useEffect(() => {
    fijarUrgentes(urgentes)
  }, [urgentes, fijarUrgentes])
}
