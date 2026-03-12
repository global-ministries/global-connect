"use client"

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LogoGlobalConnect } from '@/components/ui/logo-global-connect'
import { SelectorCampus } from '@/components/ui/selector-campus'
import {
  Users,
  UserCheck,
  Settings,
  HelpCircle,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Home,
  User,
  Megaphone,
  MapPin,
  Calendar,
  BarChart3,
  House,
  ShieldAlert
} from 'lucide-react'
import { BadgeSistema } from './sistema-diseno'
import { UserAvatar } from './UserAvatar'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { logout } from '@/lib/actions/auth.actions'
import { ThemeToggle } from './theme-toggle'

interface SidebarModernaProps {
  className?: string
}

interface SubItem {
  id: string
  label: string
  href: string
  icon?: React.ComponentType<{ className?: string }>
}

interface MenuItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  href: string
  badge?: string | number
  badgeVariant?: 'default' | 'success' | 'warning' | 'error' | 'info'
  children?: SubItem[]
}

const menuItems: MenuItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: Home,
    href: '/dashboard',
  },
  {
    id: 'usuarios',
    label: 'Usuarios',
    icon: Users,
    href: '/users',
  },
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
      { id: 'gv-riesgo', label: 'Dashboard Riesgo', href: '/grupos-vida/dashboard-riesgo', icon: ShieldAlert },
    ],
  },
  {
    id: 'configuracion',
    label: 'Configuración',
    icon: Settings,
    href: '/configuracion',
  },
]

const footerItems: MenuItem[] = [
  {
    id: 'actualizaciones',
    label: 'Actualizaciones',
    icon: Megaphone,
    href: '/actualizaciones',
  },
  {
    id: 'ayuda',
    label: 'Ayuda',
    icon: HelpCircle,
    href: '/ayuda',
  },
]

/**
 * Sidebar principal con navegación, submenús colapsables, selector de campus.
 * Incluye modal de confirmación de logout y tooltips en modo colapsado.
 */
export function SidebarModerna({ className }: SidebarModernaProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [openSubmenus, setOpenSubmenus] = useState<Set<string>>(new Set())
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [tooltip, setTooltip] = useState<{ label: string; top: number } | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const { usuario, roles, loading } = useCurrentUser()

  // ─── Tooltip hover handlers (collapsed mode) ───
  const showTooltip = (e: React.MouseEvent, label: string) => {
    if (!isCollapsed) return
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltip({ label, top: rect.top + rect.height / 2 })
  }
  const hideTooltip = () => setTooltip(null)

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
      // Merge: keep manually opened ones, add auto-opened ones
      const merged = new Set(prev)
      newOpen.forEach(id => merged.add(id))
      return merged
    })
  }, [pathname])

  // Formatear roles para mostrar
  const formatearRoles = (roles: string[]): string => {
    if (!roles || roles.length === 0) return 'Usuario'

    const rolesAmigables = roles.map(rol => {
      switch (rol) {
        case 'admin': return 'Administrador'
        case 'lider': return 'Líder'
        case 'coordinador': return 'Coordinador'
        case 'voluntario': return 'Voluntario'
        case 'miembro': return 'Miembro'
        default: return rol.charAt(0).toUpperCase() + rol.slice(1)
      }
    })

    return rolesAmigables[0]
  }

  // Detectar si es móvil
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
      if (window.innerWidth < 768) {
        setIsCollapsed(true)
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Cargar estado del localStorage
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved !== null && !isMobile) {
      setIsCollapsed(JSON.parse(saved))
    }
  }, [isMobile])

  // Guardar estado en localStorage
  const toggleSidebar = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    if (!isMobile) {
      localStorage.setItem('sidebar-collapsed', JSON.stringify(newState))
    }
  }

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

  // Función para manejar logout
  const handleLogout = async () => {
    try {
      await logout()
    } catch (error) {
      console.error('Error durante logout:', error)
      router.push('/')
    }
  }

  const confirmLogout = () => {
    setShowLogoutModal(true)
  }

  const isActive = (href: string): boolean => {
    return pathname === href ||
      (href !== "/dashboard" && !!pathname?.startsWith(href + '/'))
  }

  const isParentActive = (item: MenuItem): boolean => {
    if (item.children) {
      return item.children.some(child =>
        pathname === child.href || !!pathname?.startsWith(child.href + '/')
      ) || pathname === item.href
    }
    return isActive(item.href)
  }

  // ─── Shared link styles ───
  const linkClasses = (active: boolean) => cn(
    "flex items-center gap-3 px-3 py-2 rounded-xl group relative min-h-[44px]",
    "transition-[background-color,color,transform] duration-200 ease-expo",
    "press-scale focus-ring touch-manipulation",
    active
      ? "bg-[var(--brand-accent)] text-[var(--brand-primary)] border border-[var(--brand-primary)]/20"
      : "text-foreground hover:bg-[var(--brand-accent)] hover:text-foreground",
    isCollapsed && "justify-center px-2"
  )

  const subLinkClasses = (active: boolean) => cn(
    "flex items-center gap-3 px-3 py-1.5 rounded-lg group relative min-h-[36px] text-sm",
    "transition-[background-color,color,transform] duration-200 ease-expo",
    "focus-ring touch-manipulation",
    active
      ? "bg-[var(--brand-accent)] text-[var(--brand-primary)] font-medium"
      : "text-muted-foreground hover:bg-[var(--brand-accent)] hover:text-foreground"
  )

  const iconClasses = (active: boolean) => cn(
    "flex-shrink-0 transition-colors",
    active ? "text-[var(--brand-primary)]" : "text-muted-foreground group-hover:text-foreground",
    isCollapsed ? "w-6 h-6" : "w-5 h-5"
  )

  // ─── Sidebar width for fixed tooltip positioning ───
  const sidebarWidth = isCollapsed ? 64 : 256

  // ─── Active indicator pill ───
  const ActivePill = () => (
    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[var(--brand-primary)] rounded-r-full animate-bounce-spring" />
  )

  return (
    <>
      {/* Overlay para móvil */}
      {isMobile && !isCollapsed && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsCollapsed(true)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed left-0 top-0 z-50 h-full flex flex-col glass-panel-elevated border-r border-[var(--glass-border)]",
          "transition-[width,transform] duration-300 ease-expo",
          isCollapsed ? "w-16" : "w-64",
          "md:relative md:z-auto",
          isMobile && isCollapsed && "-translate-x-full md:translate-x-0",
          className
        )}
      >
        {/* Header con logo y toggle */}
        <div className="flex items-center justify-between p-3">
          {!isCollapsed && (
            <div className="flex items-center">
              <LogoGlobalConnect tamaño="md" className="w-[96px] h-auto" />
            </div>
          )}

          <button
            onClick={toggleSidebar}
            aria-label={isCollapsed ? "Expandir menú" : "Contraer menú"}
            className="p-2 rounded-xl hover:bg-[var(--brand-accent)] transition-[background-color,transform] duration-200 ease-expo press-scale focus-ring touch-manipulation"
          >
            {isCollapsed ? (
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronLeft className="w-5 h-5 text-muted-foreground" />
            )}
          </button>
        </div>

        {/* Selector de Campus (desktop) */}
        {!isCollapsed && (
          <div className="px-3 pb-2">
            <SelectorCampus />
          </div>
        )}

        {/* Navegación */}
        <nav className="flex-1 px-3 py-2 overflow-y-auto">
          <ul className="space-y-0.5">
            {menuItems.map((item) => {
              const Icon = item.icon
              const hasChildren = item.children && item.children.length > 0
              const parentActive = isParentActive(item)
              const isOpen = openSubmenus.has(item.id)
              const exactActive = pathname === item.href

              return (
                <li key={item.id}>
                  {hasChildren ? (
                    <>
                      {/* Parent item with chevron toggle */}
                      <div className="flex items-center">
                        <Link
                          href={item.href}
                          aria-current={exactActive ? "page" : undefined}
                          className={cn(
                            linkClasses(parentActive),
                            "flex-1",
                            !isCollapsed && "pr-1"
                          )}
                          onMouseEnter={(e) => showTooltip(e, item.label)}
                          onMouseLeave={hideTooltip}
                        >
                          {parentActive && <ActivePill />}
                          <Icon className={iconClasses(parentActive)} />

                          {!isCollapsed && (
                            <>
                              <span className="font-medium truncate flex-1">{item.label}</span>
                              {item.badge && (
                                <BadgeSistema
                                  variante={item.badgeVariant || 'default'}
                                  tamaño="sm"
                                  className="ml-auto"
                                >
                                  {item.badge}
                                </BadgeSistema>
                              )}
                            </>
                          )}
                        </Link>

                        {/* Chevron button — only when expanded */}
                        {!isCollapsed && (
                          <button
                            onClick={() => toggleSubmenu(item.id)}
                            aria-label={isOpen ? `Cerrar submenú de ${item.label}` : `Abrir submenú de ${item.label}`}
                            aria-expanded={isOpen}
                            className={cn(
                              "p-1.5 rounded-lg transition-colors duration-200 touch-manipulation",
                              "hover:bg-[var(--brand-accent)]",
                              parentActive ? "text-[var(--brand-primary)]" : "text-muted-foreground"
                            )}
                          >
                            <ChevronDown className={cn(
                              "w-4 h-4 transition-transform duration-200",
                              isOpen && "rotate-180"
                            )} />
                          </button>
                        )}
                      </div>

                      {/* Submenu items */}
                      {!isCollapsed && (
                        <div
                          className={cn(
                            "overflow-hidden transition-[max-height,opacity] duration-300 ease-expo",
                            isOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
                          )}
                        >
                          <ul className="ml-4 pl-3 mt-1 mb-1 space-y-0.5 border-l border-border/50">
                            {item.children!.map((child) => {
                              const ChildIcon = child.icon
                              const childActive = isActive(child.href)
                              return (
                                <li key={child.id}>
                                  <Link
                                    href={child.href}
                                    aria-current={childActive ? "page" : undefined}
                                    className={subLinkClasses(childActive)}
                                  >
                                    {ChildIcon && (
                                      <ChildIcon className={cn(
                                        "w-4 h-4 flex-shrink-0 transition-colors",
                                        childActive ? "text-[var(--brand-primary)]" : "text-muted-foreground group-hover:text-foreground"
                                      )} />
                                    )}
                                    <span className="truncate">{child.label}</span>
                                  </Link>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      )}
                    </>
                  ) : (
                    /* Simple item (no children) */
                    <Link
                      href={item.href}
                      aria-current={parentActive ? "page" : undefined}
                      className={linkClasses(parentActive)}
                      onMouseEnter={(e) => showTooltip(e, item.label)}
                      onMouseLeave={hideTooltip}
                    >
                      {parentActive && <ActivePill />}
                      <Icon className={iconClasses(parentActive)} />

                      {!isCollapsed && (
                        <>
                          <span className="font-medium truncate">{item.label}</span>
                          {item.badge && (
                            <BadgeSistema
                              variante={item.badgeVariant || 'default'}
                              tamaño="sm"
                              className="ml-auto"
                            >
                              {item.badge}
                            </BadgeSistema>
                          )}
                        </>
                      )}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Footer con perfil y logout */}
        <div className="mt-auto p-3 border-t border-[var(--glass-border)] space-y-0.5">
          {/* Items secundarios */}
          {footerItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={linkClasses(active)}
                onMouseEnter={(e) => showTooltip(e, item.label)}
                onMouseLeave={hideTooltip}
              >
                {active && <ActivePill />}
                <Icon className={iconClasses(active)} />
                {!isCollapsed && (
                  <span className="font-medium truncate">{item.label}</span>
                )}
              </Link>
            )
          })}
          {/* Theme Toggle — same layout as other footer items */}
          <div
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-xl group relative w-full min-h-[44px]",
              "transition-[background-color,color,transform] duration-200 ease-expo",
              "text-foreground hover:bg-[var(--brand-accent)] hover:text-foreground",
              "touch-manipulation cursor-pointer",
              isCollapsed && "justify-center px-2"
            )}
            onMouseEnter={(e) => showTooltip(e, 'Tema')}
            onMouseLeave={hideTooltip}
          >
            <ThemeToggle className={cn(
              "!min-h-0 !min-w-0 !p-0 !bg-transparent !border-0 !shadow-none !ring-0 !rounded-none flex-shrink-0",
              isCollapsed ? "!w-6 !h-6" : "!w-5 !h-5"
            )} />
            {!isCollapsed && (
              <span className="font-medium pointer-events-none">Tema</span>
            )}
          </div>

          {/* Mi Perfil */}
          <Link
            href="/perfil"
            aria-current={pathname === '/perfil' ? "page" : undefined}
            className={linkClasses(pathname === '/perfil')}
            onMouseEnter={(e) => showTooltip(e, 'Mi Perfil')}
            onMouseLeave={hideTooltip}
          >
            {pathname === '/perfil' && <ActivePill />}

            <User className={cn(
              "flex-shrink-0 transition-colors",
              pathname === '/perfil' ? "text-[var(--brand-primary)]" : "text-muted-foreground group-hover:text-foreground",
              isCollapsed ? "w-6 h-6" : "w-5 h-5"
            )} />

            {!isCollapsed && (
              <span className="font-medium">Mi Perfil</span>
            )}
          </Link>

          {/* Cerrar Sesión */}
          <button
            onClick={confirmLogout}
            aria-label="Cerrar sesión"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-xl group relative w-full text-left min-h-[44px]",
              "transition-[background-color,color,transform] duration-200 ease-expo",
              "press-scale focus-ring touch-manipulation",
              "text-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400",
              isCollapsed && "justify-center px-2"
            )}
            onMouseEnter={(e) => showTooltip(e, 'Cerrar Sesión')}
            onMouseLeave={hideTooltip}
          >
            <LogOut className={cn(
              "flex-shrink-0 transition-colors text-muted-foreground group-hover:text-red-600 dark:group-hover:text-red-400",
              isCollapsed ? "w-6 h-6" : "w-5 h-5"
            )} />

            {!isCollapsed && (
              <span className="font-medium">Cerrar Sesión</span>
            )}
          </button>
        </div>

        {/* Fixed tooltip — renders outside scroll containers */}
        {isCollapsed && tooltip && (
          <div
            className="fixed z-[9999] px-3 py-1.5 glass-panel-elevated text-foreground text-sm rounded-lg whitespace-nowrap pointer-events-none animate-fade-in"
            style={{ top: tooltip.top, left: sidebarWidth + 8, transform: 'translateY(-50%)' }}
          >
            {tooltip.label}
            <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-[var(--glass-bg-elevated)] rotate-45 border-l border-b border-[var(--glass-border)]" />
          </div>
        )}
      </div>

      {/* Modal de confirmación de logout — Liquid Glass */}
      {showLogoutModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] animate-fade-in"
          onClick={() => setShowLogoutModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-modal-title"
        >
          <div
            className="glass-panel-elevated rounded-2xl p-6 max-w-md mx-4 animate-bounce-spring"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="logout-modal-title" className="text-lg font-semibold text-foreground mb-4">
              ¿Estás seguro que deseas cerrar sesión?
            </h3>
            <p className="text-muted-foreground mb-6">
              Se cerrará tu sesión actual y serás redirigido a la página de inicio.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowLogoutModal(false)}
                className="px-4 py-2.5 min-h-[44px] text-foreground bg-secondary hover:bg-secondary/80 rounded-xl transition-[background-color,transform] duration-200 ease-expo press-scale focus-ring touch-manipulation"
              >
                Cancelar
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2.5 min-h-[44px] text-white bg-red-600 hover:bg-red-700 rounded-xl transition-[background-color,transform] duration-200 ease-expo press-scale focus-ring touch-manipulation"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  )
}

/** Hook para leer el estado colapsado del sidebar desde localStorage. */
export function useSidebarModerna() {
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved !== null) {
      setIsCollapsed(JSON.parse(saved))
    }
  }, [])

  return { isCollapsed }
}
