"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Whether the large title is on screen: `null` when the screen has none, so the
 * bar shows its compact title from the start.
 */
interface NavegacionMovilContexto {
  tituloGrandeVisible: boolean | null
  setTituloGrandeVisible: (visible: boolean | null) => void
}

const ContextoNavegacionMovil = React.createContext<NavegacionMovilContexto | null>(null)

/**
 * Connects `BarraNavegacionMovil` to the `TituloGrande` of the same screen.
 *
 * ```tsx
 * <NavegacionMovilProvider>
 *   <BarraNavegacionMovil titulo="Servidores" atras={{ etiqueta: "Dirección de Niños", href }} />
 *   <TituloGrande titulo="Servidores" resumen={<><strong>48</strong> personas</>} />
 *   …content
 * </NavegacionMovilProvider>
 * ```
 *
 * A bar without the provider (or a screen without a large title) always shows
 * its compact title.
 */
export function NavegacionMovilProvider({ children }: { children: React.ReactNode }) {
  const [tituloGrandeVisible, setTituloGrandeVisible] = React.useState<boolean | null>(null)
  const valor = React.useMemo(() => ({ tituloGrandeVisible, setTituloGrandeVisible }), [tituloGrandeVisible])
  return <ContextoNavegacionMovil.Provider value={valor}>{children}</ContextoNavegacionMovil.Provider>
}

interface AtrasNavegacion {
  /** The previous level's label, e.g. "Dirección de Niños". */
  etiqueta: string
  href?: string
  onClick?: () => void
}

interface BarraNavegacionMovilProps {
  /** Compact title; also names the navigation landmark. */
  titulo: string
  /** Back to the previous level: a link with `href`, a button otherwise. Omit at a tab root. */
  atras?: AtrasNavegacion
  /** Up to two 44px icon buttons, each with an `aria-label`. */
  acciones?: React.ReactNode
  className?: string
}

const CLASE_ATRAS =
  "inline-flex min-h-11 max-w-[120px] items-center gap-0.5 rounded-xl px-2 text-base text-brand-text focus-ring touch-manipulation"

/**
 * Phone-only navigation bar (docs/design-system/mobile.md#navigation-bar): sticky and
 * translucent, back on the left, a compact title that fades in once the large title
 * scrolls out, and trailing actions. Screens opt in; the app chrome is unchanged.
 */
export function BarraNavegacionMovil({ titulo, atras, acciones, className }: BarraNavegacionMovilProps) {
  const contexto = React.useContext(ContextoNavegacionMovil)
  const desplazada = contexto?.tituloGrandeVisible === false
  const mostrarTitulo = contexto?.tituloGrandeVisible !== true

  const contenidoAtras = atras && (
    <>
      <ChevronLeft aria-hidden="true" className="size-6 shrink-0 -ml-1" />
      <span className="truncate">{atras.etiqueta}</span>
    </>
  )

  return (
    <nav
      aria-label={`Navegación de ${titulo}`}
      data-desplazada={desplazada || undefined}
      className={cn(
        "md:hidden sticky top-0 z-30 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center",
        "min-h-12 px-2 pt-[env(safe-area-inset-top,0px)]",
        "bg-background/72 backdrop-blur-xl backdrop-saturate-150",
        "border-b border-transparent transition-colors duration-200 motion-reduce:transition-none",
        desplazada && "border-border",
        className
      )}
    >
      <div className="col-start-1 flex min-w-0 justify-start">
        {atras?.href ? (
          <Link href={atras.href} aria-label={`Volver a ${atras.etiqueta}`} className={CLASE_ATRAS}>
            {contenidoAtras}
          </Link>
        ) : atras ? (
          <button type="button" onClick={atras.onClick} aria-label={`Volver a ${atras.etiqueta}`} className={CLASE_ATRAS}>
            {contenidoAtras}
          </button>
        ) : null}
      </div>
      <p
        aria-hidden={mostrarTitulo ? undefined : true}
        className={cn(
          "col-start-2 max-w-[180px] truncate text-base font-semibold text-foreground",
          "transition-opacity duration-200 motion-reduce:transition-none",
          mostrarTitulo ? "opacity-100" : "opacity-0"
        )}
      >
        {titulo}
      </p>
      <div className="col-start-3 flex min-w-0 justify-end text-brand-text">{acciones}</div>
    </nav>
  )
}

interface TituloGrandeProps {
  titulo: string
  /** Summary line; wrap numbers in `strong`. */
  resumen?: React.ReactNode
  className?: string
}

/**
 * Phone large title (docs/design-system/mobile.md#large-title): 34px bold title and a
 * summary line; the desktop title stays in the header. Inside a
 * `NavegacionMovilProvider` it reports when it scrolls under the nav bar.
 */
export function TituloGrande({ titulo, resumen, className }: TituloGrandeProps) {
  const setVisible = React.useContext(ContextoNavegacionMovil)?.setTituloGrandeVisible
  const centinela = React.useRef<HTMLSpanElement>(null)

  React.useEffect(() => {
    const elemento = centinela.current
    if (!setVisible || !elemento || typeof window.IntersectionObserver !== "function") return
    setVisible(true)
    // The 48px top margin is the nav bar: the title counts as gone once it slides under it.
    const observador = new window.IntersectionObserver(
      ([entrada]) => setVisible(entrada.isIntersecting),
      { rootMargin: "-48px 0px 0px 0px" }
    )
    observador.observe(elemento)
    return () => {
      observador.disconnect()
      setVisible(null)
    }
  }, [setVisible])

  return (
    <div data-slot="titulo-grande" className={cn("md:hidden px-1 pt-0.5", className)}>
      <h1 className="text-[34px] font-bold leading-[1.1] tracking-[-0.03em] text-foreground">{titulo}</h1>
      <span ref={centinela} aria-hidden="true" className="block h-px" />
      {resumen && <p className="mt-1 text-[15px] text-muted-foreground [&_strong]:text-foreground">{resumen}</p>}
    </div>
  )
}
