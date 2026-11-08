/**
 * Planner — the initials avatar of a person or couple row (planning style,
 * `.av` of docs/design-system/prototipos/planificacion-dps/01; the planned
 * `AvatarIniciales` of components.md, local here until it is built in
 * components/ui). 24px, initials 10px / 650, hue from the name over
 * `chart-1…5` (26% fill, 40% border). Decorative: the row carries the name.
 * Server-safe.
 */
import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

const TONOS = [
  'bg-[color-mix(in_oklab,var(--chart-1)_26%,var(--card))] border-[color-mix(in_oklab,var(--chart-1)_40%,transparent)]',
  'bg-[color-mix(in_oklab,var(--chart-2)_26%,var(--card))] border-[color-mix(in_oklab,var(--chart-2)_40%,transparent)]',
  'bg-[color-mix(in_oklab,var(--chart-3)_26%,var(--card))] border-[color-mix(in_oklab,var(--chart-3)_40%,transparent)]',
  'bg-[color-mix(in_oklab,var(--chart-4)_26%,var(--card))] border-[color-mix(in_oklab,var(--chart-4)_40%,transparent)]',
  'bg-[color-mix(in_oklab,var(--chart-5)_26%,var(--card))] border-[color-mix(in_oklab,var(--chart-5)_40%,transparent)]',
] as const

/** "Carlos Mendoza" → "CM"; a couple "Carlos y Yelitza Mendoza" → "CY" (first letter of each first name). */
export function iniciales(nombres: readonly string[]): string {
  const palabras = (n: string) => n.trim().split(/\s+/).filter(Boolean)
  if (nombres.length > 1) return nombres.map((n) => palabras(n)[0]?.[0] ?? '').join('').slice(0, 2).toUpperCase()
  const [primera, segunda] = palabras(nombres[0] ?? '')
  return `${primera?.[0] ?? ''}${segunda?.[0] ?? ''}`.toUpperCase()
}

const tonoDe = (texto: string): string => TONOS[[...texto].reduce((n, c) => n + c.charCodeAt(0), 0) % TONOS.length]

export function AvatarIniciales({ nombres, className }: { readonly nombres: readonly string[]; readonly className?: string }): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-6 shrink-0 select-none place-items-center rounded-full border text-[10px] font-[650] leading-none text-foreground',
        tonoDe(nombres.join(' ')),
        className,
      )}
    >
      {iniciales(nombres)}
    </span>
  )
}
