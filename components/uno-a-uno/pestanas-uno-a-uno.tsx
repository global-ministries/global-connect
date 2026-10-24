/**
 * The two views of /mis-uno-a-uno for whoever supervises (odd/tasks/uno-a-uno.md,
 * T7): "Mis 1 a 1" and "Supervisión". Links to ?vista= instead of client
 * tabs, so the page stays a server component and each view loads only its
 * own data; styled like TabsSistema (components/ui/TabsSistema.tsx).
 */

import type { ReactElement } from 'react'
import Link from 'next/link'

import { cn } from '@/lib/utils'
import type { VistaUnoAUno } from '@/lib/uno-a-uno/vista'

import { RUTA_MIS_UNO_A_UNO } from './uno-a-uno-menu-item'

const PESTANAS: readonly { vista: VistaUnoAUno; etiqueta: string; href: string }[] = [
  { vista: 'mis', etiqueta: 'Mis 1 a 1', href: RUTA_MIS_UNO_A_UNO },
  { vista: 'supervision', etiqueta: 'Supervisión', href: `${RUTA_MIS_UNO_A_UNO}?vista=supervision` },
]

export function PestanasUnoAUno({ vista }: { vista: VistaUnoAUno }): ReactElement {
  return (
    <nav
      aria-label="Vistas de Mis 1 a 1"
      className="inline-flex items-center gap-1 rounded-2xl border border-border/30 bg-card/60 p-1 shadow-sm backdrop-blur"
    >
      {PESTANAS.map((pestana) => {
        const activa = pestana.vista === vista
        return (
          <Link
            key={pestana.vista}
            href={pestana.href}
            aria-current={activa ? 'page' : undefined}
            className={cn(
              'rounded-xl px-3.5 py-2 text-sm font-medium transition-colors',
              activa ? 'bg-orange-500 text-white' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {pestana.etiqueta}
          </Link>
        )
      })}
    </nav>
  )
}
