/**
 * Niños › Salón, the Esperados and Retirados lists (odd/tasks/ninos-checkin-pco.md,
 * T2b; artboard design/ninos-checkin-pco/06-salon-celular.html, `.grp` rows):
 * one row per child with its second line and a chevron; the row opens the
 * child sheet.
 */
import { ChevronRight } from 'lucide-react'

export type FilaEstadoVista = {
  readonly id: string
  readonly nombre: string
  readonly detalle: string
}

type Props = {
  readonly etiqueta: string
  readonly filas: readonly FilaEstadoVista[]
  readonly vacio: string
  readonly onAbrir: (id: string) => void
}

export function ListaEstado({ etiqueta, filas, vacio, onAbrir }: Props) {
  if (filas.length === 0) return <p className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">{vacio}</p>
  return (
    <ul aria-label={etiqueta} className="divide-y divide-border/60 overflow-hidden rounded-md border border-border bg-card">
      {filas.map((f) => (
        <li key={f.id}>
          <button
            type="button"
            aria-label={`Abrir ${f.nombre}`}
            onClick={() => onAbrir(f.id)}
            className="focus-ring flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-accent/50 active:bg-accent"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-semibold text-foreground">{f.nombre}</span>
              <span className="block truncate text-[13px] text-muted-foreground">{f.detalle}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  )
}
