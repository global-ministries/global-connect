"use client"

import React, { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogoGlobalConnect } from '@/components/ui/logo-global-connect'
import { SelectorCampus } from '@/components/ui/selector-campus'
import { logout } from "@/lib/actions/auth.actions"
import { LogOut, User, Menu, X, ChevronDown, Bell, Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from 'next-themes'
import { UserAvatar } from './UserAvatar'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { cn } from '@/lib/utils'
import { useBranding } from '@/hooks/useBranding'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { useEntradasNavegacion, type EntradaMenu } from '@/components/navegacion/use-entradas-navegacion'
import { ENTRADAS_NAVEGACION, esEntradaActiva, esRutaActiva } from '@/lib/navegacion/registro'
import { CLASE_BOTON_ICONO_NAV, claseEnlaceNav, claseIconoNav, claseSubEnlaceNav } from '@/components/navegacion/estilos-navegacion'

function formatearRol(roles: string[]): string {
  if (!roles || roles.length === 0) return 'Usuario'
  const map: Record<string, string> = {
    admin: 'Administrador', lider: 'Líder',
    coordinador: 'Coordinador', voluntario: 'Voluntario',
    miembro: 'Miembro',
  }
  return map[roles[0]] ?? roles[0].charAt(0).toUpperCase() + roles[0].slice(1)
}

// ════════════════════════════════════════
// Mobile Header + Drawer
// ════════════════════════════════════════
/**
 * Header móvil con menú hamburguesa, avatar de usuario y popover de acciones.
 * Visible solo en pantallas menores a md (768px).
 */
interface HeaderMovilProps {
  titulo?: string
}

export function HeaderMovil({ titulo }: HeaderMovilProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [openSubmenus, setOpenSubmenus] = useState<Set<string>>(new Set())
  const pathname = usePathname()
  const { usuario, roles, loading } = useCurrentUser()
  // Every entry, its order and who sees it come from the navigation registry
  // (lib/navegacion/registro.ts), shared with the desktop sidebar and the bottom bar.
  const { principales: primaryMenuItems, pie, cuenta } = useEntradasNavegacion()
  const branding = useBranding()
  const toast = useNotificaciones()
  const { theme, setTheme } = useTheme()
  const userMenuRef = useRef<HTMLDivElement>(null)

  // Auto-expand submenus when a child route is active
  useEffect(() => {
    const newOpen = new Set<string>()
    for (const item of primaryMenuItems) {
      if (item.children?.some(child => esRutaActiva(pathname, child.href))) {
        newOpen.add(item.id)
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronización de submenús activos con la ruta actual (patrón preexistente)
    setOpenSubmenus(prev => {
      const merged = new Set(prev)
      newOpen.forEach(id => merged.add(id))
      return merged
    })
  }, [pathname, primaryMenuItems])

  const toggleSubmenu = (id: string) => {
    setOpenSubmenus(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Close on route change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- cierre del drawer al navegar (patrón preexistente)
    setDrawerOpen(false)
    setUserMenuOpen(false)
  }, [pathname])

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [userMenuOpen])

  // Lock body scroll when drawer open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  const [scrolled, setScrolled] = useState(false)

  // Detect scroll for compact header
  useEffect(() => {
    const container = document.querySelector('main') || window
    const handler = () => {
      const y = container === window
        ? window.scrollY
        : (container as HTMLElement).scrollTop
      setScrolled(y > 10)
    }
    container.addEventListener('scroll', handler, { passive: true })
    return () => container.removeEventListener('scroll', handler)
  }, [])

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  const isActive = (href: string): boolean => esRutaActiva(pathname, href)

  // ── Footer and account links (registry groups 'pie' and 'cuenta') ──
  const renderEnlacePie = (item: EntradaMenu) => {
    const Icon = item.icon
    const active = isActive(item.href)
    return (
      <Link
        key={item.id}
        href={item.href}
        prefetch={false}
        aria-current={active ? "page" : undefined}
        className={claseEnlaceNav(active)}
      >
        <Icon aria-hidden="true" className={cn(claseIconoNav(active), "size-5")} />
        <span className="text-sm">{item.label}</span>
      </Link>
    )
  }

  // ── Título inteligente por ruta ──
  const resolverTitulo = (path: string | null): string | null => {
    if (!path || path === '/dashboard') return null // → mostrar logo

    // Sub-páginas específicas (orden: más específico primero)
    const rutasInternas: [RegExp | string, string][] = [
      [/\/grupos-vida\/[^/]+\/asistencia\/registrar/, 'Registrar Asistencia'],
      [/\/grupos-vida\/[^/]+\/asistencia\/[^/]+\/editar/, 'Editar Asistencia'],
      [/\/grupos-vida\/[^/]+\/asistencia\/[^/]+/, 'Detalle Asistencia'],
      [/\/grupos-vida\/[^/]+\/asistencia/, 'Asistencia del Grupo'],
      [/\/grupos-vida\/[^/]+\/auditoria/, 'Auditoría del Grupo'],
      [/\/grupos-vida\/[^/]+\/edit/, 'Editar Grupo'],
      [/\/grupos-vida\/crear/, 'Crear Grupo'],
      [/\/grupos-vida\/casas-anfitrionas\/[^/]+/, 'Detalle Casa Anfitriona'],
      ['/grupos-vida/casas-anfitrionas', 'Casas Anfitrionas'],
      [/\/grupos-vida\/segmentos\/[^/]+\/directores/, 'Directores del Segmento'],
      [/\/grupos-vida\/segmentos\/[^/]+/, 'Detalle del Segmento'],
      ['/grupos-vida/segmentos', 'Segmentos'],
      ['/grupos-vida/directores', 'Directores'],
      [/\/grupos-vida\/temporadas\/[^/]+\/edit/, 'Editar Temporada'],
      ['/grupos-vida/temporadas/crear', 'Crear Temporada'],
      ['/grupos-vida/temporadas', 'Temporadas'],
      ['/grupos-vida/mapa', 'Mapa de Grupos'],
      [/\/grupos-vida\/reportes/, 'Reportes'],
      [/\/grupos-vida\/importar/, 'Importar Grupos'],
      // Before the catch-all below, which used to swallow them as 'Detalle del Grupo'.
      ['/grupos-vida/dashboard-riesgo', 'Salud de los Grupos'],
      ['/grupos-vida/solicitudes', 'Solicitudes'],
      ['/grupos-vida/configuracion', 'Configuración Grupos'],
      [/\/grupos-vida\/[^/]+/, 'Detalle del Grupo'],
      [/\/users\/[^/]+\/asistencia/, 'Asistencia del Usuario'],
      [/\/users\/[^/]+\/edit/, 'Editar Usuario'],
      [/\/users\/create/, 'Crear Usuario'],
      [/\/users\/[^/]+/, 'Detalle del Usuario'],
      // Niños: the same titles as the desktop header (never the fallback "Global").
      [/^\/ninos\/checkin/, 'Check-in'],
      [/^\/ninos\/familias/, 'Familias'],
      [/^\/ninos\/salon/, 'Salones'],
      [/^\/ninos\/voluntarios/, 'Voluntarios'],
      [/^\/ninos\/cartel/, 'Cartel QR'],
      [/^\/ninos\/reportes/, 'Reportes'],
      [/^\/dream-team\/mi-equipo/, 'Mi equipo'],
      [/^\/admin\/dream-team\/servidores/, 'Servidores'],
      [/^\/admin\/dream-team\/estructura/, 'Estructura'],
      ['/configuracion', 'Configuración'],
      ['/actualizaciones', 'Actualizaciones'],
      ['/ayuda', 'Ayuda'],
      ['/perfil', 'Mi Perfil'],
    ]

    for (const [pattern, label] of rutasInternas) {
      if (typeof pattern === 'string' ? path === pattern : pattern.test(path)) {
        return label
      }
    }

    // Fallback: top-level menu items
    const titleItems: EntradaMenu[] = [...primaryMenuItems, ...ENTRADAS_NAVEGACION]
    return titleItems.find(it => path.startsWith(it.href) && it.href !== '/dashboard')?.label ?? 'Global'
  }

  return (
    <>
      {/* ── Top Bar ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white/60 dark:bg-[rgba(35,35,45,0.60)] backdrop-blur-[40px] [-webkit-backdrop-filter:blur(40px)] backdrop-saturate-[1.8] border-b border-[var(--glass-border)] shadow-[var(--glass-shadow)] [transform:translateZ(0)] touch-manipulation">
        <div className={cn(
          // Height: the top inset (at least 12px) + a 44px row + 8px. The (auth)
          // layout offsets the page by the same amount.
          "flex items-center justify-between gap-2 px-2 safe-area-pt safe-area-pl safe-area-pr",
          "transition-[padding] duration-300 ease-expo",
          scrolled ? "pb-1" : "pb-2"
        )}>
          {/* Left: Hamburger */}
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menú"
            aria-expanded={drawerOpen}
            className={cn(CLASE_BOTON_ICONO_NAV, "text-foreground")}
          >
            <Menu aria-hidden="true" className="size-5" />
          </button>

          {/* Center: Logo on dashboard, page title otherwise */}
          {(() => {
            const tituloResuelto = resolverTitulo(pathname)
            return tituloResuelto === null ? (
              <LogoGlobalConnect tamaño="sm" logoLightUrl={branding.logoLightUrl} logoDarkUrl={branding.logoDarkUrl} className={cn(
                "h-auto transition-[width] duration-300 ease-expo",
                scrolled ? "w-[72px]" : "w-[80px]"
              )} />
            ) : (
              <h1 className={cn(
                "font-semibold text-foreground truncate max-w-[180px]",
                "transition-[font-size] duration-300 ease-expo",
                scrolled ? "text-sm" : "text-base"
              )}>
                {titulo ?? tituloResuelto}
              </h1>
            )
          })()}

          {/* Right: Bell + User Avatar */}
          <div className="flex items-center gap-1">
            {/* Notification bell */}
            <button
              onClick={() => toast.info('Próximamente')}
              aria-label="Notificaciones"
              className={CLASE_BOTON_ICONO_NAV}
            >
              <Bell aria-hidden="true" className="size-[18px]" />
            </button>

            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(prev => !prev)}
                aria-label="Menú de usuario"
                aria-expanded={userMenuOpen}
                className="inline-flex size-11 items-center justify-center rounded-full press-scale focus-ring touch-manipulation"
              >
                {loading ? (
                  <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
                ) : usuario ? (
                  <UserAvatar
                    photoUrl={usuario.foto_perfil_url}
                    nombre={usuario.nombre}
                    apellido={usuario.apellido}
                    size="sm"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
              </button>

              {/* User Popover */}
              {userMenuOpen && (
                <div className="absolute top-full right-0 mt-2 w-[220px] glass-panel-elevated rounded-2xl border border-[var(--glass-border)] shadow-xl overflow-hidden animate-slide-down-fade z-50">
                  {/* User info */}
                  <div className="px-4 py-3 border-b border-[var(--glass-border)]">
                    <p className="font-semibold text-sm text-foreground truncate">
                      {usuario ? `${usuario.nombre} ${usuario.apellido}` : 'Usuario'}
                    </p>
                    <p className="text-xs text-brand-text font-medium mt-0.5">
                      {formatearRol(roles)}
                    </p>
                    {usuario?.email && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {usuario.email}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="py-1">
                    <Link
                      href="/perfil"
                      prefetch={false}
                      className="flex items-center gap-3 px-4 py-2.5 min-h-11 text-sm text-foreground hover:bg-[var(--brand-accent)] transition-[background-color,transform] duration-150 press-scale focus-ring touch-manipulation"
                    >
                      <User className="w-4 h-4 text-muted-foreground" />
                      Mi Perfil
                    </Link>

                    <button
                      onClick={() => {
                        if (theme === 'light') setTheme('dark')
                        else if (theme === 'dark') setTheme('system')
                        else setTheme('light')
                      }}
                      className="flex items-center gap-3 px-4 py-2.5 min-h-11 w-full text-left text-sm text-foreground hover:bg-[var(--brand-accent)] transition-[background-color,transform] duration-150 press-scale focus-ring touch-manipulation"
                    >
                      {theme === 'light' ? <Sun className="w-4 h-4 text-muted-foreground" /> : theme === 'dark' ? <Moon className="w-4 h-4 text-muted-foreground" /> : <Monitor className="w-4 h-4 text-muted-foreground" />}
                      Tema
                    </button>

                    <div className="mx-3 border-t border-[var(--glass-border)]" />

                    <form action={logout}>
                      <button
                        type="submit"
                        className="flex items-center gap-3 px-4 py-2.5 w-full text-left min-h-11 text-sm text-danger-text hover:bg-danger/10 transition-[background-color,transform] duration-150 press-scale focus-ring touch-manipulation"
                      >
                        <LogOut className="w-4 h-4" />
                        Cerrar Sesión
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Backdrop ── */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm animate-fade-in"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}

      {/* ── Nav Drawer (full menu with submenus) ── */}
      <div
        className={cn(
          "md:hidden fixed top-0 left-0 bottom-0 z-[70] w-[280px]",
          "glass-panel-elevated border-r border-[var(--glass-border)]",
          "flex flex-col",
          "transition-transform duration-300 ease-expo",
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        )}
        role={drawerOpen ? "dialog" : undefined}
        aria-modal={drawerOpen ? true : undefined}
        aria-hidden={!drawerOpen}
        aria-label="Menú de navegación"
        inert={!drawerOpen ? true : undefined}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 safe-area-pt border-b border-[var(--glass-border)]">
          <LogoGlobalConnect tamaño="sm" className="w-[80px] h-auto" logoLightUrl={branding.logoLightUrl} logoDarkUrl={branding.logoDarkUrl} />
          <button
            onClick={closeDrawer}
            aria-label="Cerrar menú"
            className={CLASE_BOTON_ICONO_NAV}
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        {/* User Profile in Drawer */}
        <div className="px-4 py-3 border-b border-[var(--glass-border)]">
          <div className="flex items-center gap-3">
            {loading ? (
              <div className="w-10 h-10 rounded-full bg-muted animate-pulse flex-shrink-0" />
            ) : usuario ? (
              <UserAvatar
                photoUrl={usuario.foto_perfil_url}
                nombre={usuario.nombre}
                apellido={usuario.apellido}
                size="md"
                className="flex-shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm text-foreground truncate">
                {usuario ? `${usuario.nombre} ${usuario.apellido}` : 'Usuario'}
              </p>
              <p className="text-xs text-brand-text font-medium">
                {formatearRol(roles)}
              </p>
            </div>
          </div>
        </div>

        {/* Campus Selector */}
        <div className="px-4 py-3">
          <SelectorCampus />
        </div>

        {/* ── Main Navigation with Submenus ── */}
        <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto px-3 py-1">
          <ul className="space-y-0.5">
            {primaryMenuItems.map(item => {
              const Icon = item.icon
              const visibleChildren = item.children ?? []
              const hasChildren = visibleChildren.length > 0
              // A section is highlighted on its own route and on its children's routes.
              const active = esEntradaActiva(pathname, item)
              const isOpen = openSubmenus.has(item.id)

              return (
                <li key={item.id}>
                  {hasChildren ? (
                    <>
                      {/* Parent item with expandable children */}
                      <div className="flex items-center min-w-0">
                        <Link
                          href={item.href}
                          prefetch={false}
                          aria-current={pathname === item.href ? "page" : undefined}
                          className={cn(claseEnlaceNav(active), "flex-1 min-w-0 rounded-r-none")}
                        >
                          <Icon aria-hidden="true" className={cn(claseIconoNav(active), "size-5")} />
                          <span className="text-sm truncate">{item.label}</span>
                        </Link>
                        <button
                          type="button"
                          onClick={() => toggleSubmenu(item.id)}
                          aria-label={isOpen ? `Cerrar ${item.label}` : `Abrir ${item.label}`}
                          aria-expanded={isOpen}
                          className={cn(CLASE_BOTON_ICONO_NAV, "rounded-l-none", active && "bg-brand-tint text-brand")}
                        >
                          <ChevronDown aria-hidden="true" className={cn(
                            "size-4 transition-transform duration-200",
                            isOpen && "rotate-180"
                          )} />
                        </button>
                      </div>

                      {/* Sub-items */}
                      <div
                        className={cn(
                          "overflow-hidden transition-[max-height,opacity] duration-300 ease-expo",
                          isOpen ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"
                        )}
                      >
                        <ul className="ml-4 pl-3 mt-1 mb-1 space-y-0.5 border-l border-border/50">
                          {visibleChildren.map(child => {
                            const ChildIcon = child.icon
                            const childActive = isActive(child.href)
                            return (
                              <li key={child.id}>
                                <Link
                                  href={child.href}
                                  prefetch={false}
                                  aria-current={childActive ? "page" : undefined}
                                  className={claseSubEnlaceNav(childActive)}
                                >
                                  {ChildIcon && (
                                    <ChildIcon aria-hidden="true" className={cn(claseIconoNav(childActive), "size-4")} />
                                  )}
                                  <span className="truncate">{child.label}</span>
                                </Link>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    </>
                  ) : (
                    /* Simple item */
                    <Link
                      href={item.href}
                      prefetch={false}
                      aria-current={active ? "page" : undefined}
                      className={claseEnlaceNav(active)}
                    >
                      <Icon aria-hidden="true" className={cn(claseIconoNav(active), "size-5")} />
                      <span className="text-sm truncate">{item.label}</span>
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        </nav>

        {/* ── Drawer Footer (mirrors desktop sidebar bottom) ── */}
        <div className="p-3 border-t border-[var(--glass-border)] space-y-0.5 safe-area-pb">
          {pie.map(renderEnlacePie)}

          {/* Theme Toggle */}
          <button
            onClick={() => {
              if (theme === 'light') setTheme('dark')
              else if (theme === 'dark') setTheme('system')
              else setTheme('light')
            }}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl min-h-[44px] w-full text-left",
              "transition-[background-color,color,transform] duration-200 ease-expo",
              "press-scale focus-ring touch-manipulation",
              "text-foreground hover:bg-[var(--brand-accent)]"
            )}
          >
            {theme === 'light' ? <Sun className="w-5 h-5 flex-shrink-0 text-muted-foreground" /> : theme === 'dark' ? <Moon className="w-5 h-5 flex-shrink-0 text-muted-foreground" /> : <Monitor className="w-5 h-5 flex-shrink-0 text-muted-foreground" />}
            <span className="font-medium text-sm">Tema</span>
          </button>

          {cuenta.map(renderEnlacePie)}

          {/* Logout */}
          <form action={logout}>
            <button
              type="submit"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl w-full text-left min-h-[44px] text-foreground hover:bg-danger/10 hover:text-danger-text transition-[background-color,color,transform] duration-200 ease-expo press-scale focus-ring touch-manipulation"
            >
              <LogOut className="w-5 h-5 flex-shrink-0 text-muted-foreground" />
              <span className="font-medium text-sm">Cerrar Sesión</span>
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
