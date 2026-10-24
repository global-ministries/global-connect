import { useMemo } from 'react'
import type { ComponentType } from 'react'
import { Handshake } from 'lucide-react'

import { useUnoAUnoAcceso } from '@/hooks/useUnoAUnoAcceso'

/**
 * The "Mis 1 a 1" menu entry (odd/tasks/uno-a-uno.md, T4), composed into the
 * sidebar and the mobile drawer by components/navegacion/use-entradas-navegacion.ts
 * like the Niños section (components/ninos/ninos-menu-item.ts). Shown only to
 * whoever leads someone, from the server-fed flag in hooks/useUnoAUnoAcceso;
 * not in the bottom bar (no registry prioridadMovil, same as Niños).
 */

export const RUTA_MIS_UNO_A_UNO = '/mis-uno-a-uno'

export interface UnoAUnoMenuItem {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  href: string
}

export function buildUnoAUnoMenuItem(lideraAAlguien: boolean): UnoAUnoMenuItem | null {
  if (!lideraAAlguien) return null
  return { id: 'mis-uno-a-uno', label: 'Mis 1 a 1', icon: Handshake, href: RUTA_MIS_UNO_A_UNO }
}

export function useUnoAUnoMenuItem(): UnoAUnoMenuItem | null {
  const lideraAAlguien = useUnoAUnoAcceso()
  return useMemo(() => buildUnoAUnoMenuItem(lideraAAlguien), [lideraAAlguien])
}

/** Inserts the entry right after 'dashboard', or first when there is none. */
export function insertUnoAUnoMenuItem<T extends { id: string }>(items: readonly T[], entrada: T | null): T[] {
  const result = [...items]
  if (!entrada) return result
  const i = result.findIndex((item) => item.id === 'dashboard')
  result.splice(i + 1, 0, entrada)
  return result
}
