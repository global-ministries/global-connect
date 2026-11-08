/**
 * DPS — breadcrumbs of the DPS planning screens: "DPS › <pantalla>"
 * (planning style crumbs with `›`, docs/design-system/layout.md). DPS links to
 * the section root (/dps, which opens Asistencia); the current screen is
 * `aria-current`.
 */
import type { ReactElement } from 'react'
import Link from 'next/link'

export function MigasDps({ actual }: { readonly actual: string }): ReactElement {
  return (
    <nav aria-label="Ubicación">
      <ol className="flex min-w-0 flex-wrap items-center gap-0.5 text-[13px]">
        <li className="flex min-w-0 items-center">
          <Link
            href="/dps"
            className="focus-ring truncate rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:min-h-11"
          >
            DPS
          </Link>
        </li>
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
