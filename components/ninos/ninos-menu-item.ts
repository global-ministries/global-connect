import { useMemo } from 'react'
import type { ComponentType } from 'react'
import { Baby, ClipboardCheck, House, QrCode, UsersRound } from 'lucide-react'

import { useNinosAcceso, type NinosAcceso } from '@/hooks/useNinosAcceso'

/**
 * The "Niños" section of the sidebar (odd/tasks/ninos-checkin.md, N6), built
 * like the Dream Team one (components/ui/dream-team-menu-item.ts). Who sees
 * which entry comes from the server-fed flags in hooks/useNinosAcceso.
 */

type IconComponent = ComponentType<{ className?: string }>

export interface NinosMenuChild {
  id: string
  label: string
  href: string
  icon?: IconComponent
}

export interface NinosMenuItem {
  id: string
  label: string
  icon: IconComponent
  href: string
  children: NinosMenuChild[]
}

/** Asistencia (N7) stays hidden until that screen exists. */
const ASISTENCIA_LISTA = false

export function getNinosNavItems(acceso: NinosAcceso): NinosMenuChild[] {
  const items: NinosMenuChild[] = []
  if (acceso.puedeOperar) {
    items.push({ id: 'ninos-checkin', label: 'Check-in', href: '/ninos/checkin', icon: ClipboardCheck })
    items.push({ id: 'ninos-familias', label: 'Familias', href: '/ninos/familias', icon: UsersRound })
  }
  if (acceso.puedeVerSalon || acceso.puedeOperar) {
    items.push({ id: 'ninos-salon', label: 'Salones', href: '/ninos/salon', icon: House })
  }
  // Same gate as /ninos/cartel: ninos_puede_operar_algun_area().
  if (acceso.puedeOperar) {
    items.push({ id: 'ninos-cartel', label: 'Cartel QR', href: '/ninos/cartel', icon: QrCode })
  }
  if (ASISTENCIA_LISTA && acceso.puedeOperar) {
    items.push({ id: 'ninos-asistencia', label: 'Asistencia', href: '/ninos/asistencia' })
  }
  return items
}

/** The section, or null when the user sees none of its entries. */
export function buildNinosMenuItem(items: readonly NinosMenuChild[]): NinosMenuItem | null {
  if (items.length === 0) return null
  return { id: 'ninos', label: 'Niños', icon: Baby, href: items[0].href, children: [...items] }
}

export function useNinosMenuItem(): NinosMenuItem | null {
  const { puedeOperar, puedeVerSalon } = useNinosAcceso()
  return useMemo(() => buildNinosMenuItem(getNinosNavItems({ puedeOperar, puedeVerSalon })), [puedeOperar, puedeVerSalon])
}

/** Inserts the section right after `afterId` (Dream Team, else Grupos de Vida), or last. */
export function insertNinosMenuItem<T extends { id: string }>(items: readonly T[], ninos: T | null): T[] {
  const result = [...items]
  if (!ninos) return result
  let i = result.findIndex((item) => item.id === 'dream-team')
  if (i === -1) i = result.findIndex((item) => item.id === 'grupos-vida')
  result.splice(i === -1 ? result.length : i + 1, 0, ninos)
  return result
}
