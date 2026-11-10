/**
 * «Notas de líderes» (odd/tasks/home-por-rol.md T7, S11): for whoever
 * oversees leaders, the latest notes of their meetings, as the old
 * NotasLideresWidget. Up to MAX_NOTAS rows (group and date, the note in one
 * line, leader · attendance), each one opening its meeting, and «Ver todas
 * las notas (N)» to /notas-lideres. Inset grouped list on phone, the same
 * rows in a card on desktop. Hidden by the screen when there are no notes.
 *
 * Server-safe: no hooks, no handlers.
 */
import type { ReactElement } from 'react'
import Link from 'next/link'
import { ChevronRight, FileText, Users } from 'lucide-react'

import type { NotaLider } from '@/lib/inicio/cargar-notas-lideres'
import { cn } from '@/lib/utils'

import { CLASE_LINEA_FILA, CLASE_LISTA_INSET, Cuenta, EncabezadoSeccion, IconoTile, Numero } from './partes-inicio'
import { diaRelativo, RUTA_NOTAS_LIDERES, rutaReunionGrupo } from './textos-inicio'

const MAX_NOTAS = 5

const CLASE_ENLACE = 'focus-ring touch-manipulation transition-colors active:bg-accent md:hover:bg-accent/60'

type Props = {
  readonly notas: readonly NotaLider[]
  /** YYYY-MM-DD in Caracas. */
  readonly hoy: string
  readonly className?: string
}

export function SeccionNotasLideres({ notas, hoy, className }: Props): ReactElement {
  return (
    <section aria-labelledby="inicio-notas-lideres" className={className}>
      <EncabezadoSeccion id="inicio-notas-lideres" titulo="Notas de líderes">
        <Cuenta valor={notas.length} etiqueta={`, ${notas.length} ${notas.length === 1 ? 'nota' : 'notas'}`} />
      </EncabezadoSeccion>
      <div className={CLASE_LISTA_INSET}>
        <ul aria-labelledby="inicio-notas-lideres">
          {notas.slice(0, MAX_NOTAS).map((n) => (
            <li key={n.eventoId} className={CLASE_LINEA_FILA}>
              <Link href={rutaReunionGrupo(n.grupoId, n.eventoId)} className={cn('flex min-h-16 min-w-0 items-center gap-3 px-3.5 py-2.5', CLASE_ENLACE)}>
                <IconoTile icono={FileText} />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">{n.grupo}</span>
                    <span className="shrink-0 text-[13px] text-muted-foreground">{diaRelativo(n.fecha, hoy)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[15px] text-foreground">{n.nota}</span>
                  <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
                    {n.lider && <span className="min-w-0 truncate">{n.lider}</span>}
                    {n.lider && n.total !== null && <span aria-hidden="true">·</span>}
                    {n.total !== null && (
                      <span className="inline-flex shrink-0 items-center gap-1">
                        <Users aria-hidden="true" className="size-3.5" />
                        <span className="sr-only">Asistencia </span>
                        <Numero>{`${n.presentes ?? 0}/${n.total}`}</Numero>
                      </span>
                    )}
                  </span>
                </span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href={RUTA_NOTAS_LIDERES}
          className={cn('relative flex min-h-11 items-center justify-between gap-2 px-3.5 text-[15px] font-medium text-brand-text', 'before:absolute before:top-0 before:right-0 before:left-0 before:h-px before:bg-border/60', CLASE_ENLACE)}
        >
          Ver todas las notas ({notas.length})
          <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
        </Link>
      </div>
    </section>
  )
}
