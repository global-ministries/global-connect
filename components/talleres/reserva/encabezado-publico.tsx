/**
 * Public header of /talleres/reservar (design/talleres-reserva/01, 02): the
 * Global mark, the breadcrumb from md, and "Entrar" for members. On phones
 * a taller page shows "‹ Talleres" instead of the crumbs. A system bar, so
 * it is the one translucent surface. Server-safe.
 */
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface MigaPublica {
  readonly etiqueta: string
  readonly href?: string
}

const enlace = 'focus-ring inline-flex min-h-11 items-center rounded-xl px-2'

export function EncabezadoPublico({ migas = [], atras }: { migas?: readonly MigaPublica[]; atras?: { etiqueta: string; href: string } }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/72 pt-[env(safe-area-inset-top,0px)] backdrop-blur-xl backdrop-saturate-150">
      <div className="flex min-h-12 items-center gap-2 px-2 sm:px-4 md:min-h-16 lg:px-10">
        {atras && (
          <Link href={atras.href} aria-label={`Volver a ${atras.etiqueta}`} className={`${enlace} gap-0.5 text-base font-medium text-brand-text md:hidden`}>
            <ChevronLeft aria-hidden="true" className="-ml-1 size-6" />
            {atras.etiqueta}
          </Link>
        )}
        <Link href="/talleres/reservar" aria-label="Iglesia Global, Grupos de Corto Plazo" className={`${enlace} gap-2 text-[15px] font-bold text-foreground ${atras ? 'max-md:hidden' : ''}`}>
          <span aria-hidden="true" className="size-6 rounded-md bg-brand md:size-7" />
          Global
        </Link>
        {migas.length > 0 && (
          <nav aria-label="Ruta" className="hidden min-w-0 flex-1 items-center gap-0.5 text-sm text-muted-foreground md:flex">
            {migas.map((m, i) => (
              <span key={m.etiqueta} className="flex min-w-0 items-center gap-0.5">
                {i > 0 && <ChevronRight aria-hidden="true" className="size-4 shrink-0" />}
                {m.href ? (
                  <Link href={m.href} className={`${enlace} hover:bg-accent hover:text-foreground`}>
                    {m.etiqueta}
                  </Link>
                ) : (
                  <span aria-current="page" className="truncate px-2 font-semibold text-foreground">
                    {m.etiqueta}
                  </span>
                )}
              </span>
            ))}
          </nav>
        )}
        <span className="flex-1 md:hidden" />
        {migas.length === 0 && <span className="hidden flex-1 md:block" />}
        <Link href="/" className={`${enlace} text-base font-medium text-brand-text`}>
          Entrar
        </Link>
      </div>
    </header>
  )
}

export function PiePublico() {
  return (
    <footer className="grid gap-1 px-5 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-[13px] text-muted-foreground lg:px-12">
      <span>
        <b className="font-semibold text-foreground">Iglesia Global</b> · Dirección de Conexión
      </span>
      <span>Grupos de Corto Plazo</span>
    </footer>
  )
}
