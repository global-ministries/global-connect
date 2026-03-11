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
  Home,
  User,
  BarChart3,
  Megaphone
} from 'lucide-react'
import { BadgeSistema } from './sistema-diseno'
import { UserAvatar } from './UserAvatar'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { logout } from '@/lib/actions/auth.actions'
import { ThemeToggle } from './theme-toggle'

interface SidebarModernaProps {
  className?: string
}

interface MenuItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  href: string
  badge?: string | number
  badgeVariant?: 'default' | 'success' | 'warning' | 'error' | 'info'
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
    href: '/dashboard/users',
  },
  {
    id: 'grupos',
    label: 'Grupos',
    icon: UserCheck,
    href: '/dashboard/grupos',
  },
  {
    id: 'reportes',
    label: 'Reportes',
    icon: BarChart3,
    href: '/dashboard/reportes/asistencia-semanal',
  },
  {
    id: 'configuracion',
    label: 'Configuración',
    icon: Settings,
    href: '/dashboard/configuracion',
  },
]

const footerItems: MenuItem[] = [
  {
    id: 'actualizaciones',
    label: 'Actualizaciones',
    icon: Megaphone,
    href: '/dashboard/actualizaciones',
  },
  {
    id: 'ayuda',
    label: 'Ayuda',
    icon: HelpCircle,
    href: '/dashboard/help',
  },
]

/**
 * Sidebar principal con navegación, selector de campus y colapso animado.
 * Incluye modal de confirmación de logout y tooltips en modo colapsado.
 */
export function SidebarModerna({ className }: SidebarModernaProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { usuario, roles, loading } = useCurrentUser()

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

  const isActive = (elemento: MenuItem) => {
    const esActivo = pathname === elemento.href ||
      (elemento.href !== "/dashboard" && pathname?.startsWith(elemento.href))
    return esActivo
  }

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
        <nav className="flex-1 px-3 py-2">
          <ul className="space-y-0.5">
            {menuItems
              .filter((it) => {
                const ocultarReportes = roles.includes('lider') || roles.includes('miembro')
                if (it.id === 'reportes' && ocultarReportes) return false
                return true
              })
              .map((item) => {
                const Icon = item.icon
                const active = isActive(item)

                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-xl group relative min-h-[44px]",
                        "transition-[background-color,color,transform] duration-200 ease-expo",
                        "press-scale focus-ring touch-manipulation",
                        active
                          ? "bg-[var(--brand-accent)] text-[var(--brand-primary)] border border-[var(--brand-primary)]/20"
                          : "text-foreground hover:bg-[var(--brand-accent)] hover:text-foreground",
                        isCollapsed && "justify-center px-2"
                      )}
                    >
                      {/* Active indicator pill — spring entrance */}
                      {active && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[var(--brand-primary)] rounded-r-full animate-bounce-spring" />
                      )}

                      <Icon className={cn(
                        "flex-shrink-0 transition-colors",
                        active ? "text-[var(--brand-primary)]" : "text-muted-foreground group-hover:text-foreground",
                        isCollapsed ? "w-6 h-6" : "w-5 h-5"
                      )} />

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

                      {/* Tooltip para modo colapsado */}
                      {isCollapsed && (
                        <div className="absolute left-full ml-2 px-3 py-1.5 glass-panel-elevated text-foreground text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-[opacity,visibility] duration-200 ease-expo whitespace-nowrap z-50">
                          {item.label}
                          <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-[var(--glass-bg-elevated)] rotate-45 border-l border-b border-[var(--glass-border)]"></div>
                        </div>
                      )}
                    </Link>
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
            const active = isActive(item)
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-xl group relative min-h-[44px]",
                  "transition-[background-color,color,transform] duration-200 ease-expo",
                  "press-scale focus-ring touch-manipulation",
                  active
                    ? "bg-[var(--brand-accent)] text-[var(--brand-primary)] border border-[var(--brand-primary)]/20"
                    : "text-foreground hover:bg-[var(--brand-accent)] hover:text-foreground",
                  isCollapsed && "justify-center px-2"
                )}
              >
                {active && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[var(--brand-primary)] rounded-r-full animate-bounce-spring" />
                )}
                <Icon className={cn(
                  "flex-shrink-0 transition-colors",
                  active ? "text-[var(--brand-primary)]" : "text-muted-foreground group-hover:text-foreground",
                  isCollapsed ? "w-6 h-6" : "w-5 h-5"
                )} />
                {!isCollapsed && (
                  <span className="font-medium truncate">{item.label}</span>
                )}
                {isCollapsed && (
                  <div className="absolute left-full ml-2 px-3 py-1.5 glass-panel-elevated text-foreground text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-[opacity,visibility] duration-200 ease-expo whitespace-nowrap z-50">
                    {item.label}
                    <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-[var(--glass-bg-elevated)] rotate-45 border-l border-b border-[var(--glass-border)]"></div>
                  </div>
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
          >
            <ThemeToggle className={cn(
              "!min-h-0 !min-w-0 !p-0 !bg-transparent !border-0 !shadow-none !ring-0 !rounded-none flex-shrink-0",
              isCollapsed ? "!w-6 !h-6" : "!w-5 !h-5"
            )} />
            {!isCollapsed && (
              <span className="font-medium pointer-events-none">Tema</span>
            )}
            {isCollapsed && (
              <div className="absolute left-full ml-2 px-3 py-1.5 glass-panel-elevated text-foreground text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-[opacity,visibility] duration-200 ease-expo whitespace-nowrap z-50">
                Tema
                <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-[var(--glass-bg-elevated)] rotate-45 border-l border-b border-[var(--glass-border)]"></div>
              </div>
            )}
          </div>

          {/* Mi Perfil */}
          <Link
            href="/dashboard/perfil"
            aria-current={pathname === '/dashboard/perfil' ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-xl group relative w-full min-h-[44px]",
              "transition-[background-color,color,transform] duration-200 ease-expo",
              "press-scale focus-ring touch-manipulation",
              pathname === '/dashboard/perfil'
                ? "bg-[var(--brand-accent)] text-[var(--brand-primary)] border border-[var(--brand-primary)]/20"
                : "text-foreground hover:bg-[var(--brand-accent)] hover:text-foreground",
              isCollapsed && "justify-center px-2"
            )}
          >
            {pathname === '/dashboard/perfil' && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[var(--brand-primary)] rounded-r-full animate-bounce-spring" />
            )}

            <User className={cn(
              "flex-shrink-0 transition-colors",
              pathname === '/dashboard/perfil' ? "text-[var(--brand-primary)]" : "text-muted-foreground group-hover:text-foreground",
              isCollapsed ? "w-6 h-6" : "w-5 h-5"
            )} />

            {!isCollapsed && (
              <span className="font-medium">Mi Perfil</span>
            )}

            {/* Tooltip para modo colapsado */}
            {isCollapsed && (
              <div className="absolute left-full ml-2 px-3 py-1.5 glass-panel-elevated text-foreground text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-[opacity,visibility] duration-200 ease-expo whitespace-nowrap z-50">
                Mi Perfil
                <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-[var(--glass-bg-elevated)] rotate-45 border-l border-b border-[var(--glass-border)]"></div>
              </div>
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
          >
            <LogOut className={cn(
              "flex-shrink-0 transition-colors text-muted-foreground group-hover:text-red-600 dark:group-hover:text-red-400",
              isCollapsed ? "w-6 h-6" : "w-5 h-5"
            )} />

            {!isCollapsed && (
              <span className="font-medium">Cerrar Sesión</span>
            )}

            {/* Tooltip para modo colapsado */}
            {isCollapsed && (
              <div className="absolute left-full ml-2 px-3 py-1.5 glass-panel-elevated text-foreground text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-[opacity,visibility] duration-200 ease-expo whitespace-nowrap z-50">
                Cerrar Sesión
                <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-[var(--glass-bg-elevated)] rotate-45 border-l border-b border-[var(--glass-border)]"></div>
              </div>
            )}
          </button>
        </div>
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
