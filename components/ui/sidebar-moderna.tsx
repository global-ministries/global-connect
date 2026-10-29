"use client"

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Building2, ChevronDown, PanelLeft } from 'lucide-react'

import { cn } from '@/lib/utils'
import { LogoGlobalConnect } from '@/components/ui/logo-global-connect'
import { SelectorCampus, useNombreCampusActivo, useSelectorCampusVisible } from '@/components/ui/selector-campus'
import { TalleresNavSubmenu } from '@/components/talleres/nav-submenu'
import { useBranding } from '@/hooks/useBranding'
import { esEntradaTalleres, useEntradasNavegacion, type EntradaMenu } from '@/components/navegacion/use-entradas-navegacion'
import { PanelFlotanteRiel } from '@/components/navegacion/panel-flotante-riel'
import {
  CLASE_BOTON_ICONO_SHELL,
  claseEntradaSidebar,
  claseSubEntradaSidebar,
} from '@/components/navegacion/estilos-navegacion'
import { esEntradaActiva, esRutaActiva } from '@/lib/navegacion/registro'
import { SECCIONES_PRINCIPALES, type SeccionNavegacion } from '@/lib/navegacion/secciones'

interface SidebarModernaProps {
  className?: string
}

/**
 * movil: below md the sidebar is hidden and inert (the phone shell takes over);
 * tablet: md–lg, always the 64px rail; escritorio: lg and up, 256px unless the
 * user collapsed it to the rail (persisted).
 */
type ModoSidebar = 'movil' | 'tablet' | 'escritorio'

/** Section headers of the sidebar (S9.2). General has none; Dream Team is a group entry. */
const TITULOS_SECCION: Partial<Record<SeccionNavegacion, string>> = {
  ministerios: 'Ministerios',
  administracion: 'Administración',
}

const ID_FLYOUT_CAMPUS = 'campus'

function calcularModo(): ModoSidebar {
  if (typeof window.matchMedia === 'function') {
    if (window.matchMedia('(max-width: 767.98px)').matches) return 'movil'
    if (window.matchMedia('(max-width: 1023.98px)').matches) return 'tablet'
    return 'escritorio'
  }
  return window.innerWidth < 768 ? 'movil' : window.innerWidth < 1024 ? 'tablet' : 'escritorio'
}

function useModoSidebar(): ModoSidebar {
  const [modo, setModo] = useState<ModoSidebar>('escritorio')
  useEffect(() => {
    const actualizar = () => setModo(calcularModo())
    actualizar()
    window.addEventListener('resize', actualizar)
    return () => window.removeEventListener('resize', actualizar)
  }, [])
  return modo
}

/**
 * PR51 — the talleres submenu (TalleresNavSubmenu) aggregates links across the
 * WHOLE talleres route family: the participant tree (/talleres/*) AND the
 * admin tree (/admin/talleres/*). The platform parent's own href is only the
 * participant landing (/talleres/explorar), so the group counts as holding the
 * current page anywhere in the family.
 */
function enFamiliaTalleres(pathname: string | null): boolean {
  return (
    !!pathname &&
    (pathname === '/talleres' ||
      pathname.startsWith('/talleres/') ||
      pathname === '/admin/talleres' ||
      pathname.startsWith('/admin/talleres/'))
  )
}

/**
 * A group entry opens a submenu: entries with children, and the talleres
 * platform items (PR27: their view-item type has `children?: never`, but they
 * open the role-grouped TalleresNavSubmenu).
 */
function esGrupo(entrada: EntradaMenu): boolean {
  return (entrada.children?.length ?? 0) > 0 || esEntradaTalleres(entrada)
}

/** The group holds the current page: its own route, a child's, or (talleres) the whole family. */
function grupoContiene(pathname: string | null, entrada: EntradaMenu): boolean {
  if (esEntradaTalleres(entrada)) return esRutaActiva(pathname, entrada.href) || enFamiliaTalleres(pathname)
  return esEntradaActiva(pathname, entrada)
}

/** The parent page is current only when no child already links to it (one aria-current per page). */
function esPadreActual(pathname: string | null, entrada: EntradaMenu): boolean {
  return pathname === entrada.href && !(entrada.children ?? []).some((hija) => hija.href === entrada.href)
}

/**
 * The desktop and tablet sidebar of the app shell (odd/tasks/sistema-diseno-v2.md,
 * S9; prototype design/app-shell): the campus selector under the logo, the
 * entries by section (general · Ministerios · Dream Team · Administración) and
 * the footer links (Actualizaciones, Ayuda). Theme, Mi perfil and Cerrar sesión
 * live in the account menu of the header.
 *
 * Submenus are an accordion: one open at a time, and the group of the current
 * page opens by itself. In the rail (tablet, or desktop collapsed) entries are
 * icons with a tooltip, and a group opens its pages in a flyout panel.
 */
export function SidebarModerna({ className }: SidebarModernaProps) {
  const [colapsado, setColapsado] = useState(false)
  const [grupoAbierto, setGrupoAbierto] = useState<string | null>(null)
  const [flyout, setFlyout] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ id: string; label: string; top: number; left: number } | null>(null)
  const anclaFlyout = useRef<HTMLElement | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const modo = useModoSidebar()
  const branding = useBranding()
  const campusVisible = useSelectorCampusVisible()
  const nombreCampus = useNombreCampusActivo()

  // Restore collapsed preference after mount to avoid SSR/client mismatch (#224)
  useEffect(() => {
    const saved = window.localStorage.getItem('sidebar-collapsed')
    /* eslint-disable react-hooks/set-state-in-effect -- restoring persisted UI preference after mount (pre-existing pattern) */
    setColapsado(parseSidebarCollapsed(saved))
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  // Every entry, its section, its order and who sees it come from the
  // navigation registry (lib/navegacion/registro.ts, lib/navegacion/secciones.ts).
  const { secciones, platformSession } = useEntradasNavegacion()
  const cuerpo = useMemo(() => secciones.filter((grupo) => SECCIONES_PRINCIPALES.includes(grupo.seccion)), [secciones])
  const pie = useMemo(() => secciones.find((grupo) => grupo.seccion === 'pie')?.entradas ?? [], [secciones])
  const grupos = useMemo(() => cuerpo.flatMap((grupo) => grupo.entradas).filter(esGrupo), [cuerpo])
  const idGrupoActual = grupos.find((entrada) => grupoContiene(pathname, entrada))?.id ?? null

  // On every navigation the group of the current page opens (closing the
  // others) and any rail flyout closes. Adjusted during render, not in an
  // effect, so the first paint already shows the open group.
  const claveRuta = `${pathname}|${idGrupoActual}`
  const [rutaVista, setRutaVista] = useState<string | null>(null)
  if (claveRuta !== rutaVista) {
    setRutaVista(claveRuta)
    if (idGrupoActual) setGrupoAbierto(idGrupoActual)
    setFlyout(null)
  }

  // PR21.2 + PR21.3: When the browser tab becomes visible again (user
  // switches back to the tab), refresh the server tree AND dispatch a
  // custom event so the client-side CurrentUserProvider re-fetches the
  // platformSession. This makes newly-granted capabilities appear in
  // the navigation without requiring a full logout+login.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') {
        router.refresh()
        window.dispatchEvent(new CustomEvent('talleres:refresh-session'))
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [router])

  const esMovil = modo === 'movil'
  const riel = modo === 'tablet' || (modo === 'escritorio' && colapsado)

  const alternarColapsado = () => {
    const nuevo = !colapsado
    setColapsado(nuevo)
    setFlyout(null)
    setTooltip(null)
    localStorage.setItem('sidebar-collapsed', JSON.stringify(nuevo))
  }

  // Accordion: opening a group closes the open one.
  const alternarGrupo = (id: string) => setGrupoAbierto((actual) => (actual === id ? null : id))

  const alternarFlyout = (id: string, boton: HTMLElement) => {
    setTooltip(null)
    if (flyout === id) {
      setFlyout(null)
      return
    }
    anclaFlyout.current = boton
    setFlyout(id)
  }

  // ─── Rail tooltips: on hover and on keyboard focus, beside the sidebar ───
  const mostrarTooltip = (elemento: HTMLElement, id: string, label: string) => {
    if (!riel || flyout) return
    const rect = elemento.getBoundingClientRect()
    const borde = elemento.closest('[data-sidebar]')?.getBoundingClientRect().right ?? rect.right
    setTooltip({ id, label, top: rect.top + rect.height / 2, left: borde + 8 })
  }
  const ocultarTooltip = () => setTooltip(null)
  const manejadoresTooltip = (id: string, label: string) =>
    riel
      ? {
          onMouseEnter: (e: React.MouseEvent<HTMLElement>) => mostrarTooltip(e.currentTarget, id, label),
          onMouseLeave: ocultarTooltip,
          onFocus: (e: React.FocusEvent<HTMLElement>) => mostrarTooltip(e.currentTarget, id, label),
          onBlur: ocultarTooltip,
        }
      : {}

  // ─── Entries ───
  const renderEnlace = (entrada: EntradaMenu) => {
    const Icono = entrada.icon
    const activo = esRutaActiva(pathname, entrada.href)
    return (
      <li key={entrada.id}>
        <Link
          href={entrada.href}
          prefetch={false}
          aria-current={activo ? 'page' : undefined}
          aria-label={riel ? entrada.label : undefined}
          className={cn(claseEntradaSidebar(activo), riel && 'justify-center px-0')}
          {...manejadoresTooltip(entrada.id, entrada.label)}
        >
          <Icono aria-hidden="true" className={cn('shrink-0', riel ? 'size-5' : 'size-[18px]')} />
          {!riel && <span className="min-w-0 flex-1 truncate">{entrada.label}</span>}
        </Link>
      </li>
    )
  }

  const renderSubmenu = (entrada: EntradaMenu) =>
    esEntradaTalleres(entrada) ? (
      /* PR27 — the Talleres platform item renders the role-grouped sub-menu. */
      <TalleresNavSubmenu
        sessionCapabilities={(platformSession?.capabilities ?? []).map((c) => c.key)}
        counters={{}}
      />
    ) : (
      <ul className={cn('grid', riel ? 'gap-0.5' : 'mt-0.5 mb-1.5 ml-5 border-l border-sidebar-border pl-2.5')}>
        {(entrada.children ?? []).map((hija) => {
          const activa = esRutaActiva(pathname, hija.href)
          return (
            <li key={hija.id}>
              <Link
                href={hija.href}
                prefetch={false}
                aria-current={activa ? 'page' : undefined}
                className={claseSubEntradaSidebar(activa)}
              >
                <span className="min-w-0 truncate">{hija.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    )

  const renderGrupo = (entrada: EntradaMenu) => {
    const Icono = entrada.icon
    const contiene = grupoContiene(pathname, entrada)
    const padreActual = esPadreActual(pathname, entrada)
    const idSubmenu = `submenu-${entrada.id}`

    if (riel) {
      const abierto = flyout === entrada.id
      return (
        <li key={entrada.id}>
          <button
            type="button"
            onClick={(e) => alternarFlyout(entrada.id, e.currentTarget)}
            aria-label={contiene ? `${entrada.label}, contiene la página actual` : entrada.label}
            aria-haspopup="dialog"
            aria-expanded={abierto}
            aria-controls={abierto ? `flyout-${entrada.id}` : undefined}
            className={cn(
              claseEntradaSidebar(false),
              'justify-center px-0',
              contiene && 'bg-brand-tint text-foreground',
              abierto && 'bg-accent text-foreground',
            )}
            {...manejadoresTooltip(entrada.id, entrada.label)}
          >
            <Icono aria-hidden="true" className="size-5 shrink-0" />
          </button>
        </li>
      )
    }

    const abierto = grupoAbierto === entrada.id
    return (
      <li key={entrada.id}>
        <div className="flex min-w-0 items-center gap-0.5">
          <Link
            href={entrada.href}
            prefetch={false}
            aria-current={padreActual ? 'page' : undefined}
            className={cn(claseEntradaSidebar(padreActual, contiene), 'min-w-0 flex-1')}
          >
            <Icono aria-hidden="true" className="size-[18px] shrink-0" />
            <span className="min-w-0 flex-1 truncate">{entrada.label}</span>
          </Link>
          <button
            type="button"
            onClick={() => alternarGrupo(entrada.id)}
            aria-label={abierto ? `Cerrar submenú de ${entrada.label}` : `Abrir submenú de ${entrada.label}`}
            aria-expanded={abierto}
            aria-controls={idSubmenu}
            className={CLASE_BOTON_ICONO_SHELL}
          >
            <ChevronDown
              aria-hidden="true"
              className={cn('size-4 transition-transform duration-150 ease-out-quint', abierto && 'rotate-180')}
            />
          </button>
        </div>
        {/* Kept in the tree for the transition; closed, it is collapsed and inert
            (out of the tab order and the accessibility tree). */}
        <div
          id={idSubmenu}
          inert={!abierto || undefined}
          className={cn(
            'overflow-hidden transition-[max-height,opacity] duration-300 ease-expo',
            abierto
              ? esEntradaTalleres(entrada)
                ? // PR51 — the talleres submenu can hold the full role union (up to
                  // ~22 items for a multi-capability admin): a 1200px cap fits them all.
                  'max-h-[1200px] opacity-100'
                : 'max-h-[500px] opacity-100'
              : 'max-h-0 opacity-0',
          )}
        >
          {renderSubmenu(entrada)}
        </div>
      </li>
    )
  }

  const entradaFlyout = flyout && flyout !== ID_FLYOUT_CAMPUS ? grupos.find((entrada) => entrada.id === flyout) : undefined

  return (
    <div
      data-sidebar=""
      className={cn(
        'relative hidden h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex',
        'transition-[width] duration-300 ease-expo',
        riel ? 'w-16 px-2.5 pt-4 pb-3' : 'w-64 px-3.5 pt-4 pb-3',
        className,
      )}
      aria-hidden={esMovil ? true : undefined}
      inert={esMovil ? true : undefined}
    >
      {/* Logo and the collapse toggle (desktop only; the tablet rail is automatic) */}
      <div className={cn('mb-2.5 flex items-center gap-1', riel && 'flex-col')}>
        {!riel && (
          <div className="flex min-h-11 min-w-0 flex-1 items-center px-2">
            <LogoGlobalConnect tamaño="md" className="h-auto w-[96px]" logoLightUrl={branding.logoLightUrl} logoDarkUrl={branding.logoDarkUrl} />
          </div>
        )}
        {modo === 'escritorio' && (
          <button
            type="button"
            onClick={alternarColapsado}
            aria-label={riel ? 'Expandir menú' : 'Contraer menú'}
            aria-expanded={!riel}
            className={CLASE_BOTON_ICONO_SHELL}
            {...manejadoresTooltip('colapsar', riel ? 'Expandir menú' : 'Contraer menú')}
          >
            <PanelLeft aria-hidden="true" className="size-5" />
          </button>
        )}
      </div>

      {/* Campus selector under the logo; in the rail, a button that opens it in a flyout */}
      {campusVisible && (
        <div className="mb-2">
          {riel ? (
            <button
              type="button"
              onClick={(e) => alternarFlyout(ID_FLYOUT_CAMPUS, e.currentTarget)}
              aria-label={`Campus: ${nombreCampus}`}
              aria-haspopup="dialog"
              aria-expanded={flyout === ID_FLYOUT_CAMPUS}
              aria-controls={flyout === ID_FLYOUT_CAMPUS ? 'flyout-campus' : undefined}
              className={cn(CLASE_BOTON_ICONO_SHELL, 'w-full', flyout === ID_FLYOUT_CAMPUS && 'bg-accent text-foreground')}
              {...manejadoresTooltip(ID_FLYOUT_CAMPUS, `Campus: ${nombreCampus}`)}
            >
              <Building2 aria-hidden="true" className="size-5" />
            </button>
          ) : (
            <SelectorCampus />
          )}
        </div>
      )}

      <nav
        className={cn('-mx-3.5 min-h-0 flex-1 overflow-y-auto px-3.5 pb-2', riel && '-mx-2.5 px-2.5')}
        aria-label="Navegación principal"
      >
        {cuerpo.map((grupo) => {
          const titulo = TITULOS_SECCION[grupo.seccion]
          const idTitulo = `seccion-${grupo.seccion}`
          const lista = (
            <ul className="grid gap-0.5">{grupo.entradas.map((entrada) => (esGrupo(entrada) ? renderGrupo(entrada) : renderEnlace(entrada)))}</ul>
          )
          if (!titulo) return <div key={grupo.seccion}>{lista}</div>
          return (
            <div key={grupo.seccion} role="group" aria-labelledby={idTitulo}>
              {/* In the rail the header turns into a separator line and stays as the group's name. */}
              {riel && <div aria-hidden="true" className="mx-2 my-2.5 h-px bg-sidebar-border" />}
              <h2
                id={idTitulo}
                className={
                  riel ? 'sr-only' : 'px-2.5 pt-3.5 pb-1.5 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground'
                }
              >
                {titulo}
              </h2>
              {lista}
            </div>
          )
        })}
      </nav>

      {/* Footer links: Actualizaciones, Ayuda */}
      {pie.length > 0 && (
        <div className={cn('-mx-3.5 border-t border-sidebar-border px-3.5 pt-2', riel && '-mx-2.5 px-2.5')}>
          <ul className="grid gap-0.5">{pie.map(renderEnlace)}</ul>
        </div>
      )}

      {/* Rail flyouts: one at a time, fixed beside the rail */}
      {riel && entradaFlyout && (
        <PanelFlotanteRiel
          abierto
          onCerrar={() => setFlyout(null)}
          ancla={anclaFlyout}
          id={`flyout-${entradaFlyout.id}`}
          titulo={entradaFlyout.label}
        >
          <ul className="grid gap-0.5">
            <li>
              <Link
                href={entradaFlyout.href}
                prefetch={false}
                aria-current={esPadreActual(pathname, entradaFlyout) ? 'page' : undefined}
                className={claseSubEntradaSidebar(esPadreActual(pathname, entradaFlyout))}
              >
                <span className="min-w-0 truncate">{entradaFlyout.label}</span>
              </Link>
            </li>
          </ul>
          {renderSubmenu(entradaFlyout)}
        </PanelFlotanteRiel>
      )}
      {riel && flyout === ID_FLYOUT_CAMPUS && (
        <PanelFlotanteRiel abierto onCerrar={() => setFlyout(null)} ancla={anclaFlyout} id="flyout-campus" titulo="Campus" etiqueta="Campus">
          <div className="px-1 pb-1.5">
            <SelectorCampus />
          </div>
        </PanelFlotanteRiel>
      )}

      {/* Rail tooltip — a fixed layer so the scrolling nav never clips it */}
      {riel && tooltip && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[85] -translate-y-1/2 whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1.5 text-[13px] font-medium text-background"
          style={{ top: tooltip.top, left: tooltip.left }}
        >
          {tooltip.label}
        </div>
      )}
    </div>
  )
}

function parseSidebarCollapsed(saved: string | null): boolean {
  if (saved === null) return false
  try {
    const parsed = JSON.parse(saved)
    return parsed === true
  } catch {
    return false
  }
}

/** Hook para leer el estado colapsado del sidebar desde localStorage. */
export function useSidebarModerna() {
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    const saved = window.localStorage.getItem('sidebar-collapsed')
    /* eslint-disable react-hooks/set-state-in-effect -- restoring persisted UI preference after mount (pre-existing pattern) */
    setIsCollapsed(parseSidebarCollapsed(saved))
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  return { isCollapsed }
}
