/**
 * DPS — breadcrumbs of the DPS planning screens: "DPS › <pantalla>", or
 * "DPS › Plan › Matriz" with a `padre` (planning style crumbs with `›`,
 * docs/design-system/layout.md). DPS links to the section root (/dps, which
 * opens Asistencia); the current screen is `aria-current`.
 */
import type { ReactElement } from 'react'
import Link from 'next/link'

const CLASE_ENLACE =
  'focus-ring truncate rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:min-h-11'

function Separador(): ReactElement {
  return (
    <span aria-hidden="true" className="px-0.5 text-muted-foreground">
      ›
    </span>
  )
}

export function MigasDps({ actual, padre }: { readonly actual: string; readonly padre?: { readonly href: string; readonly texto: string } }): ReactElement {
  return (
    <nav aria-label="Ubicación">
      <ol className="flex min-w-0 flex-wrap items-center gap-0.5 text-[13px]">
        <li className="flex min-w-0 items-center">
          <Link href="/dps" className={CLASE_ENLACE}>
            DPS
          </Link>
        </li>
        {padre && (
          <li className="flex min-w-0 items-center gap-0.5">
            <Separador />
            <Link href={padre.href} className={CLASE_ENLACE}>
              {padre.texto}
            </Link>
          </li>
        )}
        <li className="flex min-w-0 items-center gap-0.5">
          <Separador />
          <span aria-current="page" className="truncate px-2 py-1.5 font-semibold text-foreground">
            {actual}
          </span>
        </li>
      </ol>
    </nav>
  )
}
