"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useEntradasNavegacion } from '@/components/navegacion/use-entradas-navegacion'
import { esPestanaActiva } from '@/lib/navegacion/secciones'

export function MenuInferiorMovil() {
  const pathname = usePathname()
  // The tabs (up to four, lib/navegacion/secciones.ts) are picked from the
  // entries the sidebar shows this user, in every navigation mode, so the bar
  // never shows anything the menus hide. The "Más" sheet (`mas`) comes with
  // the phone shell (odd/tasks/sistema-diseno-v2.md, T8d).
  const { pestanas } = useEntradasNavegacion()

  return (
    <nav aria-label="Navegación inferior" className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/60 dark:bg-[rgba(35,35,45,0.60)] backdrop-blur-[40px] [-webkit-backdrop-filter:blur(40px)] backdrop-saturate-[1.8] border-t border-[var(--glass-border)] shadow-[var(--glass-shadow)] [transform:translateZ(0)] touch-manipulation">
      {/* Height: 8px + a 56px item + the bottom inset (at least 8px); the (auth) layout pads the page by it. */}
      <ul className="flex min-w-0 items-stretch justify-around gap-1 px-2 pt-2 safe-area-pb safe-area-pl safe-area-pr">
        {pestanas.map((elemento) => {
          const Icono = elemento.icon
          const esActivo = esPestanaActiva(pathname, elemento)

          return (
            <li key={elemento.id} className="flex min-w-0 flex-1">
              <Link
                href={elemento.href}
                prefetch={false}
                aria-label={`Navegar a ${elemento.label}`}
                aria-current={esActivo ? "page" : undefined}
                className={cn(
                  "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5",
                  "transition-[background-color,color,transform] duration-200 ease-expo",
                  "press-scale focus-ring touch-manipulation",
                  esActivo
                    ? "bg-brand-tint text-brand-text"
                    : "text-muted-foreground hover:bg-[var(--brand-accent)] hover:text-foreground"
                )}
              >
                <Icono aria-hidden="true" className={cn("size-5 shrink-0", esActivo ? "text-brand" : "text-muted-foreground")} />
                <span className={cn("max-w-full truncate text-xs", esActivo ? "font-semibold" : "font-medium")}>
                  {elemento.labelMovil}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
