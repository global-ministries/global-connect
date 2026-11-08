import { useMemo } from 'react'
import type { ComponentType } from 'react'
import { CalendarRange, Clapperboard, ClipboardCheck, Settings2, Sheet } from 'lucide-react'

import { useDpsAcceso } from '@/hooks/useDpsAcceso'
import { puedeAbrirAsistenciaDps, type DpsAcceso } from '@/lib/platform/dps/acceso'
import type { PlatformSession } from '@/lib/platform/session/types'

/**
 * The "DPS" section of the sidebar (odd/tasks/dps-asistencia-pco.md, T9,
 * L29): its own ministry under Ministerios, built like Niños and Estudiantes
 * (components/estudiantes/estudiantes-menu-item.ts): Plan (T10) ·
 * Programación (T11) · Asistencia · Configuración, from the server-fed facts in hooks/useDpsAcceso and, for
 * Asistencia, the session's coordinate / direct grants
 * (puedeAbrirAsistenciaDps). Not a phone tab: the tab bar priorities
 * (lib/navegacion/secciones.ts) are unchanged, so phones reach it through
 * "Más".
 */

type IconComponent = ComponentType<{ className?: string }>

export interface DpsMenuChild {
  id: string
  label: string
  href: string
  icon?: IconComponent
}

export interface DpsMenuItem {
  id: string
  label: string
  icon: IconComponent
  href: string
  children: DpsMenuChild[]
}

export function getDpsNavItems(acceso: DpsAcceso, session: PlatformSession | null | undefined): DpsMenuChild[] {
  if (!session) return []
  const items: DpsMenuChild[] = []
  // Same gate as /dps/plan (dps_planes_rango): whoever sees DPS reads the plan; editing is the RPCs' call.
  if (acceso.ver) {
    items.push({ id: 'dps-plan', label: 'Plan', href: '/dps/plan', icon: CalendarRange })
    // Same gate as /dps/programacion (dps_planes_rango): everyone who sees DPS reads the sheet; planners edit it.
    items.push({ id: 'dps-programacion', label: 'Programación', href: '/dps/programacion', icon: Sheet })
  }
  // Same gate as /dps/asistencia's sheet: a planner, or sees DPS and coordinates or directs some team.
  if (puedeAbrirAsistenciaDps(session, acceso)) {
    items.push({ id: 'dps-asistencia', label: 'Asistencia', href: '/dps/asistencia', icon: ClipboardCheck })
  }
  // Same gate as /dps/configuracion: dps_puede_planificar.
  if (acceso.planificar) {
    items.push({ id: 'dps-configuracion', label: 'Configuración', href: '/dps/configuracion', icon: Settings2 })
  }
  return items
}

/** The section, or null when the user sees none of its entries. */
export function buildDpsMenuItem(items: readonly DpsMenuChild[]): DpsMenuItem | null {
  if (items.length === 0) return null
  return { id: 'dps', label: 'DPS', icon: Clapperboard, href: items[0].href, children: [...items] }
}

export function useDpsMenuItem(platformSession: PlatformSession | null | undefined): DpsMenuItem | null {
  const { ver, planificar } = useDpsAcceso()
  return useMemo(() => buildDpsMenuItem(getDpsNavItems({ ver, planificar }, platformSession)), [ver, planificar, platformSession])
}

/**
 * Inserts the section right after Estudiantes (else Niños, else Dream Team,
 * else Grupos de Vida), or last: the newest ministry goes after the others,
 * so their places do not move.
 */
export function insertDpsMenuItem<T extends { id: string }>(items: readonly T[], dps: T | null): T[] {
  const result = [...items]
  if (!dps) return result
  const despues = ['estudiantes', 'ninos', 'dream-team', 'grupos-vida'].map((id) => result.findIndex((item) => item.id === id)).find((i) => i !== -1)
  result.splice(despues === undefined ? result.length : despues + 1, 0, dps)
  return result
}
