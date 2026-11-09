/**
 * «Explorar» (design/home-por-rol): the door to everything of the church, like
 * Church Center's tabs. Always last; the tiles come from decidirSecciones, so
 * Dream Team is not named before Próximo Paso (S3).
 */
import type { ReactElement } from 'react'
import Link from 'next/link'

import type { TileExplorar } from '@/lib/inicio/decidir-secciones'
import { cn } from '@/lib/utils'

import { EncabezadoSeccion, IconoTile } from './partes-inicio'
import { TILES } from './textos-inicio'

type Props = {
  readonly tiles: TileExplorar[]
  /** Alone on its desktop row: one row of four instead of a 2×2 block. */
  readonly ancha: boolean
  readonly className?: string
}

export function SeccionExplorar({ tiles, ancha, className }: Props): ReactElement {
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
                  <span className="mt-0.5 block text-[13px] text-muted-foreground">{t.detalle}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
