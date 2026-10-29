import { useMemo } from 'react'
import type { ComponentType } from 'react'
import { HeartHandshake, Network, UserCheck, Users } from 'lucide-react'

import {
  getDreamTeamNavItems,
  isDreamTeamEnabledClient,
  type DreamTeamNavItem,
} from '@/lib/platform/dream-team/navigation'
import type { SeccionNavegacion } from '@/lib/navegacion/secciones'
import type { PlatformSession } from '@/lib/platform/session/types'
import { useDreamTeamAcceso } from '@/hooks/useDreamTeamAcceso'

/**
 * The "Dream Team" section of the navigation, shared by the desktop sidebar
 * (components/ui/sidebar-moderna.tsx), the phone tab bar and the /dream-team
 * root page so all show the same entries, in the same order, with the same
 * icons and under the same rule. The entries and who sees
 * which come from lib/platform/dream-team/navigation.ts; this module only owns
 * the icon choice and where the section sits.
 */

type IconComponent = ComponentType<{ className?: string }>

export interface DreamTeamMenuChild {
  id: string
  label: string
  href: string
  icon?: IconComponent
  /** One line on the /dream-team root page (components/navegacion/accesos-seccion.tsx). */
  descripcion?: string
}

/** One expandable group in its own sidebar section; "Equipo" in the phone tab bar. */
export interface DreamTeamMenuItem {
  id: string
  label: string
  labelMovil: string
  icon: IconComponent
  href: string
  /** The Equipo tab opens this root page (app/(auth)/dream-team/page.tsx), which lists the children. */
  hrefRaiz: string
  seccion: SeccionNavegacion
  children: DreamTeamMenuChild[]
}

/** The Dream Team root page: the Equipo tab, listing every Dream Team page the user can open. */
export const RAIZ_DREAM_TEAM = '/dream-team'

// Icons and descriptions for the Dream Team children (see lib/platform/dream-team/navigation.ts
// for the id/label/href list itself).
const DREAM_TEAM_CHILD_ICONS: Record<string, IconComponent> = {
  'dt-mi-equipo': Users,
  'dt-servidores': UserCheck,
  'dt-estructura': Network,
}

const DREAM_TEAM_CHILD_DESCRIPTIONS: Record<string, string> = {
  'dt-mi-equipo': 'Las personas de tu equipo y sus turnos',
  'dt-servidores': 'Quién sirve, en qué etapa y dónde',
  'dt-estructura': 'Direcciones, áreas y equipos',
}

/** The section for these items, or null when the session sees none of them. */
export function buildDreamTeamMenuItem(items: readonly DreamTeamNavItem[]): DreamTeamMenuItem | null {
  if (items.length === 0) return null
  return {
    id: 'dream-team',
    label: 'Dream Team',
    labelMovil: 'Equipo',
    icon: HeartHandshake,
    href: items[0].href,
    hrefRaiz: RAIZ_DREAM_TEAM,
    seccion: 'dream-team',
    children: items.map((item) => ({
      id: item.id,
      label: item.label,
      href: item.href,
      icon: DREAM_TEAM_CHILD_ICONS[item.id],
      descripcion: DREAM_TEAM_CHILD_DESCRIPTIONS[item.id],
    })),
  }
}

/**
 * The Dream Team section for a client session — null when the flag is off, there
 * is no session or the session can open no Dream Team screen.
 *
 * The flag is read through isDreamTeamEnabledClient(), which reads the literal
 * `process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED` expression Next.js inlines into
 * the client bundle, instead of through isDreamTeamEnabled() (server-only-safe,
 * but always false in the browser bundle). See lib/platform/dream-team/navigation.ts.
 */
export function useDreamTeamMenuItem(platformSession: PlatformSession | null | undefined): DreamTeamMenuItem | null {
  const enabled = isDreamTeamEnabledClient()
  // The volunteer coordinator's flag comes from the (auth) layout (hooks/useDreamTeamAcceso).
  const { puedeRegistrar } = useDreamTeamAcceso()
  const navItems = useMemo(
    () => getDreamTeamNavItems(platformSession, enabled, { puedeRegistrar }),
    [platformSession, enabled, puedeRegistrar],
  )
  return useMemo(() => buildDreamTeamMenuItem(navItems), [navItems])
}

/**
 * Inserts the Dream Team section right after 'grupos-vida' (before the platform
 * navigation items), the slot it occupies in the design. Items come back
 * unchanged when there is no section; without a 'grupos-vida' item it goes last.
 */
export function insertDreamTeamMenuItem<T extends { id: string }>(
  items: readonly T[],
  dreamTeam: T | null,
): T[] {
  const result = [...items]
  if (dreamTeam) {
    const gruposVidaIndex = result.findIndex((item) => item.id === 'grupos-vida')
    result.splice(gruposVidaIndex === -1 ? result.length : gruposVidaIndex + 1, 0, dreamTeam)
  }
  return result
}
