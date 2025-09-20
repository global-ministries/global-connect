"use client"

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { 
  Users, 
  UserCheck, 
  Settings, 
  HelpCircle, 
  LogOut,
  ChevronLeft,
  ChevronRight,
  Home,
  Calendar,
  User
} from 'lucide-react'
import { BadgeSistema } from './sistema-diseno'
import { UserAvatar } from './UserAvatar'
import { useCurrentUser } from '@/hooks/useCurrentUser'

interface SidebarModernaProps {
  className?: string
}

interface MenuItem {
  id: string
  label: string
  icon: React.ComponentType<any>
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
    id: 'temporadas',
    label: 'Temporadas',
    icon: Calendar,
    href: '/dashboard/temporadas',
  },
  {
    id: 'configuracion',
    label: 'Configuración',
    icon: Settings,
    href: '/dashboard/settings',
  },
  {
    id: 'ayuda',
    label: 'Ayuda',
    icon: HelpCircle,
    href: '/dashboard/help',
  },
]

export function SidebarModerna({ className }: SidebarModernaProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const pathname = usePathname()
  const { usuario, roles, loading } = useCurrentUser()

  // Formatear roles para mostrar
  const formatearRoles = (roles: string[]): string => {
    if (!roles || roles.length === 0) return 'Usuario'
    
    // Mapear roles internos a nombres amigables
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
    
    // Si tiene múltiples roles, mostrar el más importante o el primero
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
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsCollapsed(true)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed left-0 top-0 z-50 h-full bg-white border-r border-gray-200 transition-all duration-300 ease-in-out",
          isCollapsed ? "w-16" : "w-64",
          "md:relative md:z-auto",
          isMobile && isCollapsed && "-translate-x-full md:translate-x-0",
          className
        )}
      >
        {/* Header con logo y toggle */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          {!isCollapsed && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">GC</span>
              </div>
              <span className="font-semibold text-gray-900">Global Connect</span>
            </div>
          )}
          
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {isCollapsed ? (
              <ChevronRight className="w-5 h-5 text-gray-600" />
            ) : (
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            )}
          </button>
        </div>

        {/* Perfil de usuario */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            {loading ? (
              // Skeleton loading
              <>
                <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
                {!isCollapsed && (
                  <div className="min-w-0 flex-1">
                    <div className="h-4 bg-gray-200 rounded animate-pulse mb-1" />
                    <div className="h-3 bg-gray-200 rounded animate-pulse w-3/4" />
                  </div>
                )}
              </>
            ) : usuario ? (
              // Usuario logueado
              <>
                <UserAvatar
                  photoUrl={usuario.foto_perfil_url}
                  nombre={usuario.nombre}
                  apellido={usuario.apellido}
                  size="md"
                  className="flex-shrink-0"
                />
                {!isCollapsed && (
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 truncate">
                      {usuario.nombre} {usuario.apellido}
                    </p>
                    <p className="text-sm text-gray-500 truncate">
                      {formatearRoles(roles)}
                    </p>
                  </div>
                )}
              </>
            ) : (
              // Usuario no encontrado/error
              <>
                <div className="w-10 h-10 rounded-full bg-gray-400 flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-white" />
                </div>
                {!isCollapsed && (
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 truncate">Usuario</p>
                    <p className="text-sm text-gray-500 truncate">No identificado</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Navegación */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon
              const active = isActive(item)
              
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative",
                      active 
                        ? "bg-orange-50 text-orange-700 border border-orange-200" 
                        : "text-gray-700 hover:bg-gray-50 hover:text-gray-900",
                      isCollapsed && "justify-center px-2"
                    )}
                  >
                    <Icon className={cn(
                      "flex-shrink-0 transition-colors",
                      active ? "text-orange-600" : "text-gray-500 group-hover:text-gray-700",
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
                      <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50">
                        {item.label}
                        <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
                      </div>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Footer con perfil y logout */}
        <div className="p-4 border-t border-gray-200 space-y-2">
          {/* Mi Perfil */}
          <Link
            href="/dashboard/perfil"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative w-full",
              pathname === '/dashboard/perfil'
                ? "bg-orange-50 text-orange-700 border border-orange-200" 
                : "text-gray-700 hover:bg-gray-50 hover:text-gray-900",
              isCollapsed && "justify-center px-2"
            )}
          >
            <User className={cn(
              "flex-shrink-0 transition-colors",
              pathname === '/dashboard/perfil' ? "text-orange-600" : "text-gray-500 group-hover:text-gray-700",
              isCollapsed ? "w-6 h-6" : "w-5 h-5"
            )} />
            
            {!isCollapsed && (
              <span className="font-medium">Mi Perfil</span>
            )}

            {/* Tooltip para modo colapsado */}
            {isCollapsed && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50">
                Mi Perfil
                <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
              </div>
            )}
          </Link>

          {/* Cerrar Sesión */}
          <button
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative w-full text-left",
              "text-gray-700 hover:bg-red-50 hover:text-red-700",
              isCollapsed && "justify-center px-2"
            )}
          >
            <LogOut className={cn(
              "flex-shrink-0 transition-colors text-gray-500 group-hover:text-red-600",
              isCollapsed ? "w-6 h-6" : "w-5 h-5"
            )} />
            
            {!isCollapsed && (
              <span className="font-medium">Cerrar Sesión</span>
            )}

            {/* Tooltip para modo colapsado */}
            {isCollapsed && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50">
                Cerrar Sesión
                <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
              </div>
            )}
          </button>
        </div>
      </div>

    </>
  )
}

// Hook para usar el estado del sidebar
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
