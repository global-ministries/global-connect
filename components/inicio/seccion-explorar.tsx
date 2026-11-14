/**
 * «Explorar» (design/home-por-rol; odd/tasks/home-por-rol.md S15): only what
 * the person can still add. Talleres for everyone, with how many have open
 * enrollment for them; «Inscribir a mis hijos» for an adult without children
 * registered. Always last; the tiles come from decidirSecciones.
 */
import type { ReactElement, ReactNode } from 'react'
import Link from 'next/link'

import type { TileExplorar } from '@/lib/inicio/decidir-secciones'
import { cn } from '@/lib/utils'

import { EncabezadoSeccion, IconoTile } from './partes-inicio'
import { TILES } from './textos-inicio'

type Props = {
  readonly tiles: TileExplorar[]
  /** Alone on its desktop row: one row of four instead of a 2×2 block. */
  readonly ancha: boolean
  /** Talleres with open enrollment for the person; null or undefined when unknown. */
  readonly talleresAbiertos?: number | null
  readonly className?: string
}

function detalle(tile: TileExplorar, talleresAbiertos: number | null | undefined): ReactNode {
  if (tile === 'talleres' && talleresAbiertos && talleresAbiertos > 0) {
    return (
      <>
        <span className="font-mono tabular-nums">{talleresAbiertos}</span> con inscripción abierta
      </>
    )
  }
  return TILES[tile].detalle
}

export function SeccionExplorar({ tiles, ancha, talleresAbiertos, className }: Props): ReactElement {
  return (
    <section aria-labelledby="inicio-explorar" className={className}>
      <EncabezadoSeccion id="inicio-explorar" titulo="Explorar" />
      <ul aria-labelledby="inicio-explorar" className={cn('grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2.5 md:gap-3', ancha && 'lg:grid-cols-[repeat(4,minmax(0,1fr))]')}>
        {tiles.map((tile) => {
          const t = TILES[tile]
          return (
            <li key={tile} className="min-w-0">
              <Link
                href={t.href}
                className="focus-ring flex h-full min-h-24 flex-col gap-2.5 rounded-2xl border border-border/60 bg-card p-3.5 touch-manipulation transition-colors active:bg-accent md:border-border md:hover:bg-accent/60"
              >
                <IconoTile icono={t.icono} />
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold leading-tight text-foreground">{t.titulo}</span>
                  <span className="mt-0.5 block text-[13px] text-muted-foreground">{detalle(tile, talleresAbiertos)}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
