import { useMemo } from 'react'
import type { ComponentType } from 'react'
import { ClipboardList } from 'lucide-react'

import { isTalleresEnabled } from '@/lib/platform/talleres/flags'

/**
 * The "Talleres" entry of the sidebar (odd/tasks/proximo-paso.md, T6, L18):
 * its own ministry under Ministerios, like DPS or Niños, for any signed-in
 * user whenever talleres is on (isTalleresEnabled: the same gate as the
 * /talleres pages). It does not depend on the platform navigation flag,
 * which stays off in production for Administración DPS, NextGen and 1:1
 * Global. It opens the role-grouped TalleresNavSubmenu
 * (components/talleres/nav-submenu.tsx), so it carries no children here.
 */

type IconComponent = ComponentType<{ className?: string }>

export interface TalleresMenuItem {
  id: string
  label: string
  icon: IconComponent
  href: string
}

export const ID_TALLERES = 'talleres'

/**
 * The Talleres entry, ours or the platform's (`platform-talleres_…`): both
 * open TalleresNavSubmenu instead of plain children.
 */
export function esEntradaTalleres(entrada: { id: string }): boolean {
  return entrada.id === ID_TALLERES || entrada.id.startsWith('platform-talleres_')
}

/** The entry, or null when talleres is off. */
export function buildTalleresMenuItem(habilitado: boolean): TalleresMenuItem | null {
  if (!habilitado) return null
  return { id: ID_TALLERES, label: 'Talleres', icon: ClipboardList, href: '/talleres/explorar' }
}

export function useTalleresMenuItem(autenticado: boolean): TalleresMenuItem | null {
  return useMemo(() => buildTalleresMenuItem(autenticado && isTalleresEnabled()), [autenticado])
}

/**
 * Inserts the entry right after DPS (else Estudiantes, Niños, Dream Team,
 * Grupos de Vida), or last: the newest ministry goes after the others, so
 * their places do not move.
 */
export function insertTalleresMenuItem<T extends { id: string }>(items: readonly T[], talleres: T | null): T[] {
  const result = [...items]
  if (!talleres) return result
  const despues = ['dps', 'estudiantes', 'ninos', 'dream-team', 'grupos-vida'].map((id) => result.findIndex((item) => item.id === id)).find((i) => i !== -1)
  result.splice(despues === undefined ? result.length : despues + 1, 0, talleres)
  return result
}
