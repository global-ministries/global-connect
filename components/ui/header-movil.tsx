"use client"

import React, { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogoGlobalConnect } from '@/components/ui/logo-global-connect'
import { SelectorCampus } from '@/components/ui/selector-campus'
import { logout } from "@/lib/actions/auth.actions"
import {
  LogOut, User, Menu, X, HelpCircle,
  Home, Users, UserCheck, Settings, Megaphone,
  ChevronDown, House, Calendar, MapPin, BarChart3
} from 'lucide-react'
import { ThemeToggle } from './theme-toggle'
import { UserAvatar } from './UserAvatar'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { cn } from '@/lib/utils'

// ── SubItem type ──
interface SubItem {
  id: string
  label: string
  href: string
  icon?: React.ComponentType<{ className?: string }>
}

// ── Menu items with optional children (mirror of sidebar) ──
interface MobileMenuItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  href: string
  children?: SubItem[]
}

const menuItems: MobileMenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: Home, href: '/dashboard' },
  { id: 'usuarios', label: 'Usuarios', icon: Users, href: '/users' },
  {
    id: 'grupos-vida',
    label: 'Grupos de Vida',
    icon: UserCheck,
    href: '/grupos-vida',
    children: [
      { id: 'gv-casas', label: 'Casas Anfitrionas', href: '/grupos-vida/casas-anfitrionas', icon: House },
      { id: 'gv-segmentos', label: 'Segmentos', href: '/grupos-vida/segmentos', icon: Users },
      { id: 'gv-temporadas', label: 'Temporadas', href: '/grupos-vida/temporadas', icon: Calendar },
      { id: 'gv-mapa', label: 'Mapa', href: '/grupos-vida/mapa', icon: MapPin },
      { id: 'gv-reportes', label: 'Reportes', href: '/grupos-vida/reportes/asistencia-semanal', icon: BarChart3 },
    ],
  },
  { id: 'configuracion', label: 'Configuración', icon: Settings, href: '/configuracion' },
  { id: 'actualizaciones', label: 'Actualizaciones', icon: Megaphone, href: '/actualizaciones' },
  { id: 'ayuda', label: 'Ayuda', icon: HelpCircle, href: '/ayuda' },
]

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
  const userMenuRef = useRef<HTMLDivElement>(null)

  // Auto-expand submenus when a child route is active
  useEffect(() => {
    const newOpen = new Set<string>()
    for (const item of menuItems) {
      if (item.children) {
        const isChildActive = item.children.some(child =>
          pathname === child.href || pathname?.startsWith(child.href + '/')
        )
        if (isChildActive) {
          newOpen.add(item.id)
        }
      }
    }
    setOpenSubmenus(prev => {
      const merged = new Set(prev)
      newOpen.forEach(id => merged.add(id))
      return merged
    })
  }, [pathname])

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

  const isActive = (href: string): boolean => {
    return pathname === href ||
      (href !== "/dashboard" && !!pathname?.startsWith(href + '/'))
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
      [/\/grupos-vida\/temporadas\/[^/]+\/edit/, 'Editar Temporada'],
      ['/grupos-vida/temporadas/crear', 'Crear Temporada'],
      ['/grupos-vida/temporadas', 'Temporadas'],
      ['/grupos-vida/mapa', 'Mapa de Grupos'],
      [/\/grupos-vida\/reportes/, 'Reportes'],
      [/\/grupos-vida\/importar/, 'Importar Grupos'],
      [/\/grupos-vida\/[^/]+/, 'Detalle del Grupo'],
      [/\/users\/[^/]+\/asistencia/, 'Asistencia del Usuario'],
      [/\/users\/[^/]+\/edit/, 'Editar Usuario'],
      [/\/users\/create/, 'Crear Usuario'],
      [/\/users\/[^/]+/, 'Detalle del Usuario'],
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
    return menuItems.find(it => path.startsWith(it.href) && it.href !== '/dashboard')?.label ?? 'Global'
  }

  return (
    <>
      {/* ── Top Bar ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white/60 dark:bg-[rgba(35,35,45,0.60)] backdrop-blur-[40px] [-webkit-backdrop-filter:blur(40px)] backdrop-saturate-[1.8] border-b border-[var(--glass-border)] shadow-[var(--glass-shadow)] [transform:translateZ(0)] touch-manipulation">
        <div className={cn(
          "flex items-center justify-between px-4 safe-area-pt",
          "transition-[padding] duration-300 ease-expo",
          scrolled ? "py-2" : "py-3"
        )}>
          {/* Left: Hamburger */}
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menú"
            className="p-2 rounded-xl text-foreground hover:bg-[var(--brand-accent)] transition-[background-color,transform] duration-200 ease-expo press-scale focus-ring touch-manipulation min-w-[40px] min-h-[40px] flex items-center justify-center"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Center: Logo on dashboard, page title otherwise */}
          {(() => {
            const tituloResuelto = resolverTitulo(pathname)
            return tituloResuelto === null ? (
              <LogoGlobalConnect tamaño="sm" className={cn(
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

          {/* Right: User Avatar */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(prev => !prev)}
              aria-label="Menú de usuario"
              aria-expanded={userMenuOpen}
              className="press-scale focus-ring touch-manipulation rounded-full"
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
                  <p className="text-xs text-[var(--brand-primary)] font-medium mt-0.5">
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
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-[var(--brand-accent)] transition-[background-color,transform] duration-150 press-scale focus-ring touch-manipulation"
                  >
                    <User className="w-4 h-4 text-muted-foreground" />
                    Mi Perfil
                  </Link>

                  <div className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-[var(--brand-accent)] transition-[background-color] duration-150 touch-manipulation">
                    <ThemeToggle className="!min-h-0 !min-w-0 !w-7 !h-7" />
                    <span className="text-sm text-foreground">Tema</span>
                  </div>

                  <div className="mx-3 border-t border-[var(--glass-border)]" />

                  <form action={logout}>
                    <button
                      type="submit"
                      className="flex items-center gap-3 px-4 py-2.5 w-full text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-[background-color,transform] duration-150 press-scale focus-ring touch-manipulation"
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
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 safe-area-pt border-b border-[var(--glass-border)]">
          <LogoGlobalConnect tamaño="sm" className="w-[80px] h-auto" />
          <button
            onClick={closeDrawer}
            aria-label="Cerrar menú"
            className="p-2 rounded-xl text-muted-foreground hover:bg-[var(--brand-accent)] transition-[background-color,transform] duration-200 ease-expo press-scale focus-ring touch-manipulation"
          >
            <X className="w-5 h-5" />
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
              <p className="text-xs text-[var(--brand-primary)] font-medium">
                {formatearRol(roles)}
              </p>
            </div>
          </div>
        </div>

        {/* Campus Selector */}
        <div className="px-4 py-3">
          <SelectorCampus />
        </div>

        {/* ── Full Navigation with Submenus ── */}
        <nav className="flex-1 overflow-y-auto px-3 py-1">
          <ul className="space-y-0.5">
            {menuItems.map(item => {
              const Icon = item.icon
              const hasChildren = item.children && item.children.length > 0
              const active = isActive(item.href)
              const isOpen = openSubmenus.has(item.id)

              return (
                <li key={item.id}>
                  {hasChildren ? (
                    <>
                      {/* Parent item with expandable children */}
                      <div className="flex items-center">
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex-1 flex items-center gap-3 px-3 py-2.5 rounded-l-xl min-h-[44px]",
                            "transition-[background-color,color,transform] duration-200 ease-expo",
                            "press-scale focus-ring touch-manipulation",
                            active
                              ? "bg-[var(--brand-accent)] text-[var(--brand-primary)]"
                              : "text-foreground hover:bg-[var(--brand-accent)]"
                          )}
                        >
                          <Icon className={cn(
                            "w-5 h-5 flex-shrink-0",
                            active ? "text-[var(--brand-primary)]" : "text-muted-foreground"
                          )} />
                          <span className="font-medium text-sm">{item.label}</span>
                        </Link>
                        <button
                          onClick={() => toggleSubmenu(item.id)}
                          aria-label={isOpen ? `Cerrar ${item.label}` : `Abrir ${item.label}`}
                          aria-expanded={isOpen}
                          className={cn(
                            "p-2.5 rounded-r-xl min-h-[44px] flex items-center transition-colors duration-200 touch-manipulation",
                            "hover:bg-[var(--brand-accent)]",
                            active ? "text-[var(--brand-primary)]" : "text-muted-foreground"
                          )}
                        >
                          <ChevronDown className={cn(
                            "w-4 h-4 transition-transform duration-200",
                            isOpen && "rotate-180"
                          )} />
                        </button>
                      </div>

                      {/* Sub-items */}
                      <div
                        className={cn(
                          "overflow-hidden transition-[max-height,opacity] duration-300 ease-expo",
                          isOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
                        )}
                      >
                        <ul className="ml-4 pl-3 mt-1 mb-1 space-y-0.5 border-l border-border/50">
                          {item.children!.map(child => {
                            const ChildIcon = child.icon
                            const childActive = isActive(child.href)
                            return (
                              <li key={child.id}>
                                <Link
                                  href={child.href}
                                  aria-current={childActive ? "page" : undefined}
                                  className={cn(
                                    "flex items-center gap-3 px-3 py-2 rounded-lg min-h-[36px] text-sm",
                                    "transition-[background-color,color] duration-200 ease-expo",
                                    "focus-ring touch-manipulation",
                                    childActive
                                      ? "bg-[var(--brand-accent)] text-[var(--brand-primary)] font-medium"
                                      : "text-muted-foreground hover:bg-[var(--brand-accent)] hover:text-foreground"
                                  )}
                                >
                                  {ChildIcon && (
                                    <ChildIcon className={cn(
                                      "w-4 h-4 flex-shrink-0",
                                      childActive ? "text-[var(--brand-primary)]" : "text-muted-foreground"
                                    )} />
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
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl min-h-[44px]",
                        "transition-[background-color,color,transform] duration-200 ease-expo",
                        "press-scale focus-ring touch-manipulation",
                        active
                          ? "bg-[var(--brand-accent)] text-[var(--brand-primary)]"
                          : "text-foreground hover:bg-[var(--brand-accent)]"
                      )}
                    >
                      <Icon className={cn(
                        "w-5 h-5 flex-shrink-0",
                        active ? "text-[var(--brand-primary)]" : "text-muted-foreground"
                      )} />
                      <span className="font-medium text-sm">{item.label}</span>
                    </Link>
                  )}
                </li>
              )
            })}

            {/* Perfil link */}
            <li>
              <Link
                href="/perfil"
                aria-current={pathname === '/perfil' ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl min-h-[44px]",
                  "transition-[background-color,color,transform] duration-200 ease-expo",
                  "press-scale focus-ring touch-manipulation",
                  pathname === '/perfil'
                    ? "bg-[var(--brand-accent)] text-[var(--brand-primary)]"
                    : "text-foreground hover:bg-[var(--brand-accent)]"
                )}
              >
                <User className={cn(
                  "w-5 h-5 flex-shrink-0",
                  pathname === '/perfil' ? "text-[var(--brand-primary)]" : "text-muted-foreground"
                )} />
                <span className="font-medium text-sm">Mi Perfil</span>
              </Link>
            </li>
          </ul>
        </nav>

        {/* ── Drawer Footer ── */}
        <div className="p-3 border-t border-[var(--glass-border)] space-y-0.5 safe-area-pb">
          {/* Theme Toggle */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl min-h-[44px]">
            <ThemeToggle className="!min-h-0 !min-w-0 !w-8 !h-8" />
            <span className="text-sm font-medium text-muted-foreground">Tema</span>
          </div>

          {/* Logout */}
          <form action={logout}>
            <button
              type="submit"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl w-full text-left min-h-[44px] text-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-[background-color,color,transform] duration-200 ease-expo press-scale focus-ring touch-manipulation"
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
