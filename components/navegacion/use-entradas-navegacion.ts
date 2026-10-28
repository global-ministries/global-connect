"use client"

import { useMemo } from 'react'

import { componerNavegacion, paginasTalleres, type EntradaMenu } from '@/components/navegacion/componer-navegacion'
import { useNinosMenuItem } from '@/components/ninos/ninos-menu-item'
import { useDreamTeamMenuItem } from '@/components/ui/dream-team-menu-item'
import { usePlatformNavigationViewItems } from '@/components/ui/platform-navigation-view-items'
import { useUnoAUnoMenuItem } from '@/components/uno-a-uno/uno-a-uno-menu-item'
import { useCachedAccessCredentials } from '@/hooks/useCachedAccessCredentials'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import type { CredencialesNavegacion } from '@/lib/navegacion/registro'

export type { EntradaMenu }

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
 * The visible navigation for the sidebar, the phone tab bar and its "Más"
 * sheet (components/navegacion/componer-navegacion.ts): the main list in its
 * current order, the footer and account links, the entries by section, the
 * phone tabs and the "Más" sheet contents.
 */
export function useEntradasNavegacion() {
  const { platformSession } = useCurrentUser()
  const credenciales = useCredencialesNavegacion()
  const plataforma = usePlatformNavigationViewItems(platformSession)
  const dreamTeam = useDreamTeamMenuItem(platformSession)
  const ninos = useNinosMenuItem()
  // Server-fed flags (hooks/useUnoAUnoAcceso): whoever leads, supervises or takes part in a 1:1.
  const unoAUno = useUnoAUnoMenuItem()
  const talleres = useMemo(
    () => paginasTalleres((platformSession?.capabilities ?? []).map((capacidad) => capacidad.key)),
    [platformSession],
  )

  const navegacion = useMemo(
    () => componerNavegacion({ credenciales, dreamTeam, ninos, unoAUno, plataforma, talleres }),
    [credenciales, dreamTeam, ninos, unoAUno, plataforma, talleres],
  )

  return { ...navegacion, platformSession }
}

/** Talleres platform items open the role-grouped TalleresNavSubmenu instead of plain children. */
export function esEntradaTalleres(entrada: { id: string }): boolean {
  return entrada.id.startsWith('platform-talleres_')
}
