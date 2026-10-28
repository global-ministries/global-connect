"use client"

import { useId } from 'react'
import Link from 'next/link'
import { ChevronRight, LayoutGrid } from 'lucide-react'

import { useEntradasNavegacion } from '@/components/navegacion/use-entradas-navegacion'
import type { SubEntradaNavegacion } from '@/lib/navegacion/registro'
import type { SeccionNavegacion } from '@/lib/navegacion/secciones'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'

/**
 * The pages of one navigation section as a list of shortcuts, for a section's
 * root page (prototype design/app-shell, Inicio "Accesos"). On phone the "Más"
 * sheet has no submenus (odd/tasks/sistema-diseno-v2.md, S9.8 and L21), so
 * /dream-team uses this to reach every Dream Team page the user can open.
 * The entries are the ones the sidebar shows this user: a group lists its
 * visible children, a plain entry lists itself. Each one's line under the
 * label is its `descripcion` in the navigation entries.
 */

export interface AccesosSeccionProps {
  seccion: SeccionNavegacion
  /** Heading of the list (also its accessible name). */
  titulo?: string
}

export function AccesosSeccion({ seccion, titulo = 'Accesos' }: AccesosSeccionProps) {
  const { secciones } = useEntradasNavegacion()
  const idTitulo = useId()

  const entradas = secciones.find((grupo) => grupo.seccion === seccion)?.entradas ?? []
  const accesos = entradas.flatMap<SubEntradaNavegacion>((entrada) =>
    entrada.children?.length
      ? entrada.children.map((hija) => ({ ...hija, icon: hija.icon ?? entrada.icon }))
      : [entrada],
  )

  if (accesos.length === 0) {
    return (
      <EstadoVacioSistema
        icono={LayoutGrid}
        titulo="No tenés accesos en esta sección"
        subtitulo="Cuando tengas acceso a una página de esta sección, la vas a ver acá."
      />
    )
  }

  return (
    <section aria-labelledby={idTitulo} className="grid gap-2">
      <h2 id={idTitulo} className="px-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {titulo}
      </h2>
      <ul aria-labelledby={idTitulo} className="grid grid-cols-[minmax(0,1fr)] gap-2.5 md:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] md:gap-3">
        {accesos.map((acceso) => {
          const Icono = acceso.icon
          const descripcion = acceso.descripcion
          return (
            <li key={acceso.id} className="flex min-w-0">
              <Link
                href={acceso.href}
                prefetch={false}
                className="flex min-h-16 w-full min-w-0 items-center gap-3 rounded-2xl bg-card px-3.5 py-3 text-foreground transition-colors duration-150 hover:bg-accent active:bg-accent focus-ring touch-manipulation md:border md:border-border md:p-4"
              >
                <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand-text">
                  {Icono && <Icono className="size-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{acceso.label}</span>
                  {descripcion && (
                    <span data-slot="descripcion" className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                      {descripcion}
                    </span>
                  )}
                </span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
