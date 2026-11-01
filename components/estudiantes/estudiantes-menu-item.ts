import { useMemo } from 'react'
import type { ComponentType } from 'react'
import { GraduationCap, Radio, Settings2, UsersRound } from 'lucide-react'

import { useEstudiantesAcceso } from '@/hooks/useEstudiantesAcceso'
import { entradasMenuEstudiantes, type AccesoEstudiantes, type EntradaMenuEstudiantes } from '@/lib/platform/estudiantes/acceso'

/**
 * The "Estudiantes" section of the sidebar (C4b of
 * odd/tasks/estudiantes-fase-b.md, assumption A3 of
 * design/estudiantes-asistencia), built like Niños
 * (components/ninos/ninos-menu-item.ts): Mi grupo / Mis grupos · En vivo ·
 * Grupos, from the server-fed facts in hooks/useEstudiantesAcceso (the rule
 * lives in lib/platform/estudiantes/acceso.ts). Not a phone tab: the tab bar
 * priorities (lib/navegacion/secciones.ts) are unchanged, so phones reach it
 * through "Más".
 */

type IconComponent = ComponentType<{ className?: string }>

export interface EstudiantesMenuChild {
  id: string
  label: string
  href: string
  icon?: IconComponent
}

export interface EstudiantesMenuItem {
  id: string
  label: string
  icon: IconComponent
  href: string
  children: EstudiantesMenuChild[]
}

const ICONOS: Readonly<Record<EntradaMenuEstudiantes['id'], IconComponent>> = {
  'estudiantes-mi-grupo': UsersRound,
  'estudiantes-vivo': Radio,
  'estudiantes-grupos': Settings2,
}

export function getEstudiantesNavItems(acceso: AccesoEstudiantes): EstudiantesMenuChild[] {
  return entradasMenuEstudiantes(acceso).map((entrada) => ({ ...entrada, icon: ICONOS[entrada.id] }))
}

/** The section, or null when the user sees none of its entries. */
export function buildEstudiantesMenuItem(items: readonly EstudiantesMenuChild[]): EstudiantesMenuItem | null {
  if (items.length === 0) return null
  return { id: 'estudiantes', label: 'Estudiantes', icon: GraduationCap, href: items[0].href, children: [...items] }
}

export function useEstudiantesMenuItem(): EstudiantesMenuItem | null {
  const acceso = useEstudiantesAcceso()
  return useMemo(() => buildEstudiantesMenuItem(getEstudiantesNavItems(acceso)), [acceso])
}

/** Inserts the section right after Niños (else Dream Team, else Grupos de Vida), or last. */
export function insertEstudiantesMenuItem<T extends { id: string }>(items: readonly T[], estudiantes: T | null): T[] {
  const result = [...items]
  if (!estudiantes) return result
  const despues = ['ninos', 'dream-team', 'grupos-vida'].map((id) => result.findIndex((item) => item.id === id)).find((i) => i !== -1)
  result.splice(despues === undefined ? result.length : despues + 1, 0, estudiantes)
  return result
}
