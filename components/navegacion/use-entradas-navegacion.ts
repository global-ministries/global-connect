"use client"

import { useMemo } from 'react'

import { insertNinosMenuItem, useNinosMenuItem } from '@/components/ninos/ninos-menu-item'
import { insertDreamTeamMenuItem, useDreamTeamMenuItem } from '@/components/ui/dream-team-menu-item'
import { usePlatformNavigationViewItems } from '@/components/ui/platform-navigation-view-items'
import { insertUnoAUnoMenuItem, useUnoAUnoMenuItem } from '@/components/uno-a-uno/uno-a-uno-menu-item'
import { useCachedAccessCredentials } from '@/hooks/useCachedAccessCredentials'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import {
  entradasDelGrupo,
  filtrarVisibles,
  type CredencialesNavegacion,
  type EntradaNavegacion,
} from '@/lib/navegacion/registro'

/** One entry as the sidebar and the drawer render it (registry, Dream Team, Niños or platform). */
export type EntradaMenu = Pick<EntradaNavegacion, 'id' | 'label' | 'href' | 'icon' | 'roles' | 'capabilities' | 'children'>

/**
 * The signed-in user's roles and support capabilities, keeping the last known
 * set while the session reloads (hooks/useCachedAccessCredentials).
 */
export function useCredencialesNavegacion(): CredencialesNavegacion {
  const { usuario, roles, supportCapabilities = [], loading } = useCurrentUser()
  const rolesEfectivos = useCachedAccessCredentials({ values: roles, loading, isSignedIn: !!usuario })
  const capacidadesEfectivas = useCachedAccessCredentials({ values: supportCapabilities, loading, isSignedIn: !!usuario })
  // Keyed on the contents, not the array identity: callers may hand a fresh
  // array on every render (the `= []` default above does), and the entry lists
  // derived from these credentials feed effects that set state.
  const clave = `${rolesEfectivos.join(',')}|${capacidadesEfectivas.join(',')}`
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed only when the contents change (see above)
  return useMemo(() => ({ roles: rolesEfectivos, supportCapabilities: capacidadesEfectivas }), [clave])
}

/**
 * The visible entries for the sidebar and the mobile drawer: the registry's
 * main list with "Mis 1 a 1" right after Dashboard, Dream Team and Niños right
 * after Grupos de Vida, then the platform navigation items, then the footer
 * and account links.
 */
export function useEntradasNavegacion() {
  const { platformSession } = useCurrentUser()
  const credenciales = useCredencialesNavegacion()
  const platformNavigationItems = usePlatformNavigationViewItems(platformSession)
  const dreamTeam: EntradaMenu | null = useDreamTeamMenuItem(platformSession)
  const ninos: EntradaMenu | null = useNinosMenuItem()
  // Server-fed flag (hooks/useUnoAUnoAcceso): only whoever leads someone. Not in the bottom bar.
  const unoAUno: EntradaMenu | null = useUnoAUnoMenuItem()

  const principales = useMemo(
    () =>
      filtrarVisibles<EntradaMenu>(
        [
          ...insertUnoAUnoMenuItem<EntradaMenu>(
            insertNinosMenuItem<EntradaMenu>(
              insertDreamTeamMenuItem<EntradaMenu>(entradasDelGrupo('principal'), dreamTeam),
              ninos,
            ),
            unoAUno,
          ),
          ...platformNavigationItems,
        ],
        credenciales,
      ),
    [credenciales, dreamTeam, ninos, unoAUno, platformNavigationItems],
  )
  const pie = useMemo(() => filtrarVisibles<EntradaMenu>(entradasDelGrupo('pie'), credenciales), [credenciales])
  const cuenta = useMemo(() => filtrarVisibles<EntradaMenu>(entradasDelGrupo('cuenta'), credenciales), [credenciales])

  return { principales, pie, cuenta, platformSession }
}

/** Talleres platform items open the role-grouped TalleresNavSubmenu instead of plain children. */
export function esEntradaTalleres(entrada: { id: string }): boolean {
  return entrada.id.startsWith('platform-talleres_')
}
