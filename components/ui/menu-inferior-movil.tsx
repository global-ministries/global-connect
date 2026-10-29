"use client"

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Ellipsis } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HojaMas } from '@/components/navegacion/hoja-mas'
import { useEntradasNavegacion } from '@/components/navegacion/use-entradas-navegacion'
import { esRutaActiva } from '@/lib/navegacion/registro'
import { esPestanaActiva, filasDeMas } from '@/lib/navegacion/secciones'

// A tab with a root page (Equipo: /dream-team, which lists the Dream Team pages
// the user can open, components/navegacion/accesos-seccion.tsx) opens it and
// stays active on it. Equipo also stays active on every /admin/dream-team route.
const FAMILIA_ADMIN_DREAM_TEAM = '/admin/dream-team'

function pestanaActiva(
  pathname: string | null,
  pestana: { id: string; href: string; hrefRaiz?: string; children?: readonly { href: string }[] },
): boolean {
  if (pestana.hrefRaiz && esRutaActiva(pathname, pestana.hrefRaiz)) return true
  if (pestana.id === 'dream-team' && esRutaActiva(pathname, FAMILIA_ADMIN_DREAM_TEAM)) return true
  return esPestanaActiva(pathname, pestana)
}

const CLASE_PESTANA = cn(
  'flex min-h-14 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-1.5 text-xs',
  'transition-colors duration-200 ease-expo focus-ring touch-manipulation',
)

/**
 * The phone tab bar (docs/design-system/mobile.md#tab-bar-and-fab; prototype
 * design/app-shell/03-celular.html): up to four tabs picked from the entries
 * the sidebar shows this user (lib/navegacion/secciones.ts), then "Más", which
 * opens the sheet with everything else. The current tab is brand text, with
 * no fill.
 */
export function MenuInferiorMovil() {
  const pathname = usePathname()
  const { pestanas, mas } = useEntradasNavegacion()
  const [masAbierta, setMasAbierta] = useState(false)
  // The sheet (and its sign-out dialog) mounts on the first open and stays, so it can animate out.
  const [masMontada, setMasMontada] = useState(false)
  const botonMas = useRef<HTMLButtonElement>(null)

  // Navigating from the sheet closes it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- closing the sheet on route change
    setMasAbierta(false)
  }, [pathname])

  const activas = pestanas.map((pestana) => pestanaActiva(pathname, pestana))
  const masActiva = !activas.some(Boolean) && filasDeMas(mas).some((fila) => esRutaActiva(pathname, fila.href))

  return (
    <nav
      aria-label="Navegación inferior"
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/72 backdrop-blur-xl backdrop-saturate-150 touch-manipulation"
    >
      {/* Height: 8px + a 56px tab + the bottom inset (at least 8px); the (auth) layout pads the page by it. */}
      <ul className="flex min-w-0 px-1.5 pt-2 safe-area-pb safe-area-pl safe-area-pr">
        {pestanas.map((pestana, indice) => {
          const Icono = pestana.icon
          const activa = activas[indice]

          return (
            <li key={pestana.id} className="flex min-w-0 flex-1 basis-0">
              <Link
                href={pestana.hrefRaiz ?? pestana.href}
                prefetch={false}
                aria-label={`Navegar a ${pestana.label}`}
                aria-current={activa ? 'page' : undefined}
                className={cn(CLASE_PESTANA, activa ? 'font-semibold text-brand-text' : 'font-medium text-muted-foreground')}
              >
                <Icono aria-hidden="true" className="size-6 shrink-0" />
                <span className="max-w-full truncate">{pestana.labelMovil}</span>
              </Link>
            </li>
          )
        })}
        <li className="flex min-w-0 flex-1 basis-0">
          <button
            ref={botonMas}
            type="button"
            onClick={() => {
              setMasMontada(true)
              setMasAbierta(true)
            }}
            aria-haspopup="dialog"
            aria-expanded={masAbierta}
            aria-current={masActiva ? 'page' : undefined}
            className={cn(
              CLASE_PESTANA,
              masAbierta || masActiva ? 'font-semibold text-brand-text' : 'font-medium text-muted-foreground',
            )}
          >
            <Ellipsis aria-hidden="true" className="size-6 shrink-0" />
            <span className="max-w-full truncate">Más</span>
          </button>
        </li>
      </ul>
      {masMontada && <HojaMas abierta={masAbierta} onCambioAbierta={setMasAbierta} enfocarAlCerrar={botonMas} />}
    </nav>
  )
}
