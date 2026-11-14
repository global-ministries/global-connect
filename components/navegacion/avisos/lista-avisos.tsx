"use client"

/**
 * The bell's list of in-app notices (design/talleres-reserva/11): newest
 * first, unread ones with a brand dot and bold title, the body in two lines
 * and the taller as a tag. Opening a notice marks it read and, when it has a
 * link, goes there and closes the panel. "Marcar leídos" marks them all.
 */
import Link from 'next/link'
import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'
import { cuandoAviso, type AvisoPersona } from '@/lib/platform/avisos/avisos-persona'
import { SkeletonSistema } from '@/components/ui/sistema-diseno'

export interface ListaAvisosProps {
  readonly avisos: readonly AvisoPersona[]
  readonly noLeidas: number
  readonly onAbrir: (aviso: AvisoPersona) => void
  readonly onMarcarTodos: () => void
}

const CLASE_FILA =
  'focus-ring relative grid w-full min-h-16 grid-cols-[8px_minmax(0,1fr)] gap-x-3 px-4 py-3 text-left transition-colors hover:bg-accent'

function ContenidoFila({ aviso }: { aviso: AvisoPersona }) {
  return (
    <>
      <span
        aria-hidden="true"
        data-slot="aviso-no-leido"
        className={cn('mt-1.5 size-2 rounded-full', aviso.leido ? 'bg-transparent' : 'bg-brand')}
      />
      <span className="grid min-w-0 gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className={cn('min-w-0 flex-1 truncate text-sm', aviso.leido ? 'font-medium' : 'font-semibold')}>
            {aviso.titulo}
            {!aviso.leido && <span className="sr-only">, sin leer</span>}
          </span>
          <time dateTime={aviso.creadoEn} className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {cuandoAviso(aviso.creadoEn)}
          </time>
        </span>
        {aviso.cuerpo && <span className="line-clamp-2 whitespace-pre-line text-[13px] text-muted-foreground">{aviso.cuerpo}</span>}
        {aviso.etiqueta && (
          <span className="mt-1 inline-flex w-fit max-w-full truncate rounded-md border border-border bg-muted px-1.5 text-xs leading-5 text-foreground">
            {aviso.etiqueta}
          </span>
        )}
      </span>
    </>
  )
}

export function ListaAvisos({ avisos, noLeidas, onAbrir, onMarcarTodos }: ListaAvisosProps): ReactElement {
  return (
    <div className="grid">
      {noLeidas > 0 && (
        <div className="flex justify-end px-2">
          <button
            type="button"
            onClick={onMarcarTodos}
            className="focus-ring min-h-11 rounded-lg px-2 text-[13px] font-medium text-brand-text hover:underline"
          >
            Marcar leídos
          </button>
        </div>
      )}
      <ul className="divide-y divide-border/60">
        {avisos.map((aviso) => (
          <li key={aviso.id}>
            {aviso.url ? (
              <Link href={aviso.url} onClick={() => onAbrir(aviso)} className={CLASE_FILA}>
                <ContenidoFila aviso={aviso} />
              </Link>
            ) : (
              <button type="button" onClick={() => onAbrir(aviso)} className={CLASE_FILA}>
                <ContenidoFila aviso={aviso} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Three skeleton rows while the first load runs. */
export function ListaAvisosCargando(): ReactElement {
  return (
    <div role="status" aria-busy="true" className="grid gap-4 px-4 py-4">
      <span className="sr-only">Cargando notificaciones</span>
      {[0, 1, 2].map((n) => (
        <div key={n} className="grid gap-2">
          <SkeletonSistema ancho="60%" alto="0.875rem" />
          <SkeletonSistema alto="0.75rem" />
        </div>
      ))}
    </div>
  )
}
