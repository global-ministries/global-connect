/**
 * Desktop breadcrumbs of Editar persona: "Usuarios / <nombre> / Editar"
 * (the ficha's crumbs plus the current page). On /perfil: "Mi perfil".
 * Links go through the leave guard like any in-app link (decision 9).
 */
import Link from 'next/link'
import type { ReactElement } from 'react'

const CLASE_ENLACE = 'focus-ring rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:min-h-11'

function Separador(): ReactElement {
  return <span aria-hidden="true" className="px-0.5 text-muted-foreground/60">/</span>
}

export function MigasEditar({ usuarioId, nombre }: { readonly usuarioId: string; readonly nombre: string }): ReactElement {
  return (
    <nav aria-label="Ubicación">
      <ol className="flex min-w-0 items-center gap-0.5 text-sm">
        <li>
          <Link href="/users" className={CLASE_ENLACE}>Usuarios</Link>
        </li>
        <li className="flex min-w-0 items-center gap-0.5">
          <Separador />
          <Link href={`/users/${usuarioId}`} className={`${CLASE_ENLACE} truncate`}>{nombre}</Link>
        </li>
        <li className="flex shrink-0 items-center gap-0.5">
          <Separador />
          <span aria-current="page" className="px-2 py-1.5 font-semibold text-foreground">Editar</span>
        </li>
      </ol>
    </nav>
  )
}

export function MigasPerfil(): ReactElement {
  return (
    <nav aria-label="Ubicación">
      <ol className="flex min-w-0 items-center text-sm">
        <li>
          <span aria-current="page" className="px-2 py-1.5 font-semibold text-foreground">Mi perfil</span>
        </li>
      </ol>
    </nav>
  )
}
