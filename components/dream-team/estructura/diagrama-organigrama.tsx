'use client'

/**
 * Estructura — the desktop org chart (S12; prototype `.lz-vista` in
 * prototipos/estructura/07-b-escritorio.html): connected boxes left to right
 * on a dotted canvas, the campus box first. Each box is a button that opens
 * the node panel; a box with children carries a round toggle ("−" open, "+n"
 * folded, plus a dot when the folded branch hides a problem) with
 * `aria-expanded`. Tab order follows the tree (pre-order).
 *
 * The canvas is a focusable, labelled scroll region: drag its empty space or
 * use the arrow keys to pan. Zoom goes from 80 % to 120 %; until the user
 * zooms by hand the chart fits the canvas (never below 80 %, so text stays
 * readable), and "Ajustar" goes back to that. Nothing animates when the user
 * prefers reduced motion.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Minus } from 'lucide-react'

import type { CajaOrganigrama } from '@/lib/platform/dream-team/estructura-organigrama'
import { cn } from '@/lib/utils'

import { ContenidoCaja, ContenidoRaiz, claseCaja, descripcionCaja, etiquetaPlegar } from './caja-organigrama'
import { ControlesDiagrama, LeyendaDiagrama } from './controles-diagrama'
import { ID_RAIZ_DIAGRAMA, MEDIDAS_CAJA, disponerDiagrama } from './disposicion-diagrama'

export const ZOOM_MINIMO = 0.8
export const ZOOM_MAXIMO = 1.2
const PASO_PAN = 48

export interface DiagramaOrganigramaProps {
  readonly cajas: readonly CajaOrganigrama[]
  readonly raices: readonly string[]
  readonly raiz: { readonly nombre: string; readonly personas: number }
  readonly onAbrir: (id: string) => void
  readonly onPlegar: (id: string) => void
  readonly onExpandirTodo: () => void
  readonly onContraer: () => void
}

const acotar = (zoom: number): number => Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, Math.round(zoom * 10) / 10))

export function DiagramaOrganigrama({
  cajas,
  raices,
  raiz,
  onAbrir,
  onPlegar,
  onExpandirTodo,
  onContraer,
}: DiagramaOrganigramaProps): ReactElement {
  const vista = useRef<HTMLDivElement>(null)
  const arrastre = useRef<{ x: number; y: number; izquierda: number; arriba: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [automatico, setAutomatico] = useState(true)
  const disposicion = useMemo(() => disponerDiagrama(cajas, raices), [cajas, raices])

  const encajar = useCallback((): number => {
    const elemento = vista.current
    if (!elemento || elemento.clientWidth === 0 || elemento.clientHeight === 0) return 1
    const escala = Math.min((elemento.clientHeight - 100) / disposicion.alto, (elemento.clientWidth - 52) / disposicion.ancho)
    return Math.max(ZOOM_MINIMO, Math.min(1, Math.floor(escala * 20) / 20))
  }, [disposicion])

  // Fit on load, when branches open or fold, and when the window changes size, until the user zooms by hand.
  // A ResizeObserver reports once as soon as it observes, so a new layout fits right away.
  useLayoutEffect(() => {
    const elemento = vista.current
    if (!automatico || !elemento) return
    if (typeof ResizeObserver === 'undefined') {
      const cuadro = requestAnimationFrame(() => setZoom(encajar()))
      return () => cancelAnimationFrame(cuadro)
    }
    const observador = new ResizeObserver(() => setZoom(encajar()))
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [automatico, encajar])

  // The first highlighted box (search, pill) or the selected one scrolls into view.
  const enfocar = cajas.find((caja) => caja.resaltado)?.id ?? cajas.find((caja) => caja.seleccionado)?.id ?? null
  useEffect(() => {
    if (!enfocar) return
    const elemento = [...(vista.current?.querySelectorAll<HTMLElement>('[data-caja]') ?? [])].find((caja) => caja.dataset.caja === enfocar)
    elemento?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [enfocar])

  function cambiarZoom(paso: number | 'ajustar'): void {
    if (paso === 'ajustar') {
      setAutomatico(true)
      setZoom(encajar())
      return
    }
    setAutomatico(false)
    setZoom((actual) => acotar(actual + paso))
  }

  function teclas(evento: React.KeyboardEvent<HTMLDivElement>): void {
    if (evento.target !== evento.currentTarget) return
    const desplazamiento = { ArrowLeft: [-PASO_PAN, 0], ArrowRight: [PASO_PAN, 0], ArrowUp: [0, -PASO_PAN], ArrowDown: [0, PASO_PAN] }[evento.key]
    if (!desplazamiento) return
    evento.preventDefault()
    evento.currentTarget.scrollBy?.({ left: desplazamiento[0], top: desplazamiento[1] })
  }

  function empezarArrastre(evento: React.PointerEvent<HTMLDivElement>): void {
    if (evento.button !== 0 || (evento.target as HTMLElement).closest('button')) return
    const elemento = evento.currentTarget
    arrastre.current = { x: evento.clientX, y: evento.clientY, izquierda: elemento.scrollLeft, arriba: elemento.scrollTop }
    elemento.setPointerCapture?.(evento.pointerId)
  }

  function arrastrar(evento: React.PointerEvent<HTMLDivElement>): void {
    const inicio = arrastre.current
    if (!inicio) return
    evento.currentTarget.scrollLeft = inicio.izquierda - (evento.clientX - inicio.x)
    evento.currentTarget.scrollTop = inicio.arriba - (evento.clientY - inicio.y)
  }

  const posicionRaiz = disposicion.posiciones.get(ID_RAIZ_DIAGRAMA)
  const { ancho: W, alto: H } = MEDIDAS_CAJA

  return (
    <>
      <div className="relative">
        <div
          ref={vista}
          role="region"
          aria-label="Organigrama, desplazable con las flechas"
          tabIndex={0}
          onKeyDown={teclas}
          onPointerDown={empezarArrastre}
          onPointerMove={arrastrar}
          onPointerUp={() => (arrastre.current = null)}
          onPointerCancel={() => (arrastre.current = null)}
          className={cn(
            'focus-ring relative h-[max(460px,calc(100dvh-300px))] cursor-grab overflow-auto bg-background active:cursor-grabbing',
            'bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-[size:20px_20px] [scrollbar-width:thin]',
          )}
        >
          <div className="relative box-content px-6 pt-6 pb-[76px]" style={{ width: disposicion.ancho * zoom, height: disposicion.alto * zoom }}>
            <div className="relative origin-top-left" style={{ width: disposicion.ancho, height: disposicion.alto, transform: `scale(${zoom})` }}>
              <svg aria-hidden="true" width={disposicion.ancho} height={disposicion.alto} className="absolute inset-0 overflow-visible">
                <path d={disposicion.lineas} className="fill-none stroke-muted-foreground/45" strokeWidth={1.5} />
              </svg>

              {posicionRaiz && (
                <div
                  className="absolute flex items-center gap-2.5 rounded-xl border border-brand/40 bg-brand-tint px-3 text-foreground"
                  style={{ left: posicionRaiz.x, top: posicionRaiz.y, width: W, height: H }}
                >
                  <ContenidoRaiz nombre={raiz.nombre} personas={raiz.personas} />
                </div>
              )}

              {cajas.map((caja) => {
                const posicion = disposicion.posiciones.get(caja.id)
                if (!posicion) return null
                return (
                  <div key={caja.id} data-caja={caja.id} className="absolute" style={{ left: posicion.x, top: posicion.y, width: W, height: H }}>
                    <button
                      type="button"
                      aria-label={descripcionCaja(caja)}
                      aria-current={caja.seleccionado ? 'true' : undefined}
                      onClick={() => onAbrir(caja.id)}
                      className={cn(claseCaja(caja), 'h-full', caja.hijos.length > 0 && 'pr-6')}
                    >
                      <ContenidoCaja caja={caja} />
                    </button>
                    {caja.hijos.length > 0 && <BotonPlegar caja={caja} onPlegar={onPlegar} />}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <ControlesDiagrama
          zoom={zoom}
          minimo={ZOOM_MINIMO}
          maximo={ZOOM_MAXIMO}
          onZoom={cambiarZoom}
          onExpandirTodo={onExpandirTodo}
          onContraer={onContraer}
        />
        <LeyendaDiagrama className="hidden lg:flex" />
      </div>
      <LeyendaDiagrama flotante={false} className="lg:hidden" />
    </>
  )
}

function BotonPlegar({ caja, onPlegar }: { readonly caja: CajaOrganigrama; readonly onPlegar: (id: string) => void }): ReactElement {
  return (
    <button
      type="button"
      aria-expanded={caja.abierto}
      aria-label={etiquetaPlegar(caja)}
      onClick={() => onPlegar(caja.id)}
      className={cn(
        'focus-ring absolute top-1/2 -right-3.5 z-[1] inline-flex h-7 min-w-7 -translate-y-1/2 items-center justify-center gap-[3px] rounded-full border border-border bg-card px-1.5',
        'text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground after:absolute after:-inset-2 after:content-[""]',
        !caja.abierto && 'text-foreground',
      )}
    >
      {caja.abierto ? <Minus aria-hidden="true" className="size-3.5" /> : <span className="font-mono tabular-nums">+{caja.masN}</span>}
      {caja.puntoRama && <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />}
    </button>
  )
}
