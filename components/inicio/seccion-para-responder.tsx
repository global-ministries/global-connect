/**
 * «Para responder» (design/home-por-rol section 1): one entry per queue with
 * its count, linking to the page that already handles it. Phone: inset
 * grouped rows with a chevron; from md: a grid of cards (design 05/07).
 */
import type { ReactElement } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { PuntoEstado } from '@/components/ui/punto-estado'
import type { PendienteInicio } from '@/lib/inicio/decidir-secciones'
import { cn } from '@/lib/utils'

import { CLASE_LINEA_FILA, CLASE_LISTA_INSET, Cuenta, EncabezadoSeccion, IconoTile } from './partes-inicio'
import { PENDIENTES } from './textos-inicio'

const pendientes = (n: number) => `, ${n} ${n === 1 ? 'pendiente' : 'pendientes'}`

export function SeccionParaResponder({ items, className }: { readonly items: PendienteInicio[]; readonly className?: string }): ReactElement {
  const total = items.reduce((suma, i) => suma + i.cantidad, 0)

  return (
    <section aria-labelledby="inicio-para-responder" className={className}>
      <EncabezadoSeccion id="inicio-para-responder" titulo="Para responder">
        <Cuenta valor={total} etiqueta={pendientes(total)} />
      </EncabezadoSeccion>
      <ul
        aria-labelledby="inicio-para-responder"
        className={cn(
          CLASE_LISTA_INSET,
          'md:grid md:grid-cols-[repeat(auto-fill,minmax(250px,1fr))] md:gap-3 md:overflow-visible md:rounded-none md:border-0 md:bg-transparent',
        )}
      >
        {items.map(({ tipo, cantidad }) => {
          const t = PENDIENTES[tipo]
          return (
            <li key={tipo} className={cn(CLASE_LINEA_FILA, 'md:before:hidden')}>
              <Link
                href={t.href}
                className={cn(
                  'focus-ring flex min-h-16 min-w-0 items-center gap-3 px-3.5 py-2.5 text-left touch-manipulation transition-colors active:bg-accent',
                  // From md a card: tile · status · count on top, the text, then the action.
                  'md:grid md:h-full md:min-h-[132px] md:grid-cols-[auto_minmax(0,1fr)_auto] md:grid-rows-[auto_auto_1fr] md:gap-x-2.5 md:gap-y-2.5 md:rounded-2xl md:border md:border-border md:bg-card md:p-4 md:hover:bg-accent/60',
                  t.tono === 'danger' && 'md:border-danger',
                )}
              >
                <IconoTile icono={t.icono} tono={t.tono} />
                <span className="min-w-0 flex-1 md:col-span-3 md:row-start-2">
                  <span className="block truncate text-base font-semibold text-foreground md:whitespace-normal">{t.titulo}</span>
                  <span className="mt-0.5 block truncate text-[13px] text-muted-foreground md:whitespace-normal">{t.detalle}</span>
                </span>
                <PuntoEstado tono={t.tono} etiqueta={t.estado} className="hidden md:col-start-2 md:row-start-1 md:inline-flex" />
                <Cuenta valor={cantidad} etiqueta={pendientes(cantidad)} className="md:col-start-3 md:row-start-1 md:self-center" />
                <span className="hidden items-center gap-1 self-end text-sm font-medium text-brand-text md:col-span-3 md:row-start-3 md:inline-flex">
                  {t.cta}
                  <ChevronRight aria-hidden="true" className="size-4" />
                </span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground md:hidden" />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
