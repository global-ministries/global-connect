/**
 * Estructura — the Taller tab of the node panel (S12): the taller linked to
 * the team, with a link to open it, or a one-line empty state. The link
 * itself is made from Talleres.
 */
import type { ReactElement } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import type { TallerVinculado } from '@/lib/platform/dream-team/estructura-vista'

export function PanelNodoTaller({ taller }: { readonly taller: TallerVinculado | null }): ReactElement {
  if (!taller) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-6 text-center">
        <p className="text-sm font-semibold text-foreground">Sin taller</p>
        <p className="mt-1 text-sm text-muted-foreground">Este equipo no tiene un taller.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      <Link
        href={taller.href}
        className="focus-ring flex min-h-16 items-center justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-2 transition-colors hover:bg-accent"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-foreground">{taller.nombre}</span>
          <span className="text-sm text-muted-foreground">Abrir taller</span>
        </span>
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </Link>
      <p className="text-sm text-muted-foreground">El vínculo con el taller se hace desde Talleres.</p>
    </div>
  )
}
