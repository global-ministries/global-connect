/**
 * Estudiantes — the crumbs of the planning style screens in the desktop
 * header: "Estudiantes › Transit › 2do año · Chicas" (planning style crumbs
 * with `›`, as components/dps/migas-dps.tsx). Each level but the last links
 * (`href`) or acts (`onClick`, e.g. back to the whole ámbito of En vivo) or
 * is plain text; the last one is the current page (`aria-current`).
 */
import { Fragment, type ReactElement } from 'react'
import Link from 'next/link'

const CLASE_ENLACE =
  'focus-ring truncate rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:min-h-11'

export interface Miga {
  readonly texto: string
  readonly href?: string
  readonly onClick?: () => void
}

function Nivel({ miga, actual }: { readonly miga: Miga; readonly actual: boolean }): ReactElement {
  if (actual) {
    return (
      <span aria-current="page" className="truncate px-2 py-1.5 font-semibold text-foreground">
        {miga.texto}
      </span>
    )
  }
  if (miga.href) {
    return (
      <Link href={miga.href} className={CLASE_ENLACE}>
        {miga.texto}
      </Link>
    )
  }
  if (miga.onClick) {
    return (
      <button type="button" onClick={miga.onClick} className={CLASE_ENLACE}>
        {miga.texto}
      </button>
    )
  }
  return <span className="truncate px-2 py-1.5 text-muted-foreground">{miga.texto}</span>
}

export function MigasEstudiantes({ migas }: { readonly migas: readonly Miga[] }): ReactElement {
  return (
    <nav aria-label="Ubicación">
      <ol className="flex min-w-0 flex-wrap items-center gap-0.5 text-[13px]">
        {migas.map((miga, i) => (
          <Fragment key={`${i}-${miga.texto}`}>
            {i > 0 && (
              <li aria-hidden="true" className="px-0.5 text-muted-foreground">
                ›
              </li>
            )}
            <li className="flex min-w-0 items-center">
              <Nivel miga={miga} actual={i === migas.length - 1} />
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  )
}
