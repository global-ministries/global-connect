/**
 * Planner — the breadcrumb of the planner pages: "Grupos de Vida › Temporadas
 * › <temporada>" (artboard 01, assumption A1: the season list is the parent
 * crumb). A page under a season (the publish review) passes `temporada`:
 * "… › Temporadas › 2026-II › Revisar y publicar". Server-safe. Planning
 * style (S25): 13px with `›` separators.
 */
import type { ReactElement } from 'react'
import Link from 'next/link'

const CLASE_ENLACE =
  'focus-ring truncate rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:min-h-11'

export function MigasPlanner({
  actual,
  temporada,
}: {
  readonly actual: string
  readonly temporada?: { readonly nombre: string; readonly href: string }
}): ReactElement {
  return (
    <nav aria-label="Ubicación">
      <ol className="flex min-w-0 flex-wrap items-center gap-0.5 text-[13px]">
        <li className="flex min-w-0 items-center">
          <Link href="/grupos-vida" className={CLASE_ENLACE}>
            Grupos de Vida
          </Link>
        </li>
        <li className="flex min-w-0 items-center gap-0.5">
          <span aria-hidden="true" className="px-0.5 text-muted-foreground">
            ›
          </span>
          <Link href="/grupos-vida/temporadas" className={CLASE_ENLACE}>
            Temporadas
          </Link>
        </li>
        {temporada && (
          <li className="flex min-w-0 items-center gap-0.5">
            <span aria-hidden="true" className="px-0.5 text-muted-foreground">
              ›
            </span>
            <Link href={temporada.href} className={CLASE_ENLACE}>
              {temporada.nombre}
            </Link>
          </li>
        )}
        <li className="flex min-w-0 items-center gap-0.5">
          <span aria-hidden="true" className="px-0.5 text-muted-foreground">
            ›
          </span>
          <span aria-current="page" className="truncate px-2 py-1.5 font-semibold text-foreground">
            {actual}
          </span>
        </li>
      </ol>
    </nav>
  )
}
