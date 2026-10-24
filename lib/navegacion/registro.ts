import type { ComponentType } from 'react'
import {
  BarChart3,
  Calendar,
  ClipboardList,
  HelpCircle,
  Home,
  House,
  Inbox,
  MapPin,
  Megaphone,
  Settings,
  ShieldAlert,
  User,
  UserCheck,
  UserCog,
  Users,
} from 'lucide-react'

import { canAccess } from '@/lib/navigation/canAccess'

/**
 * The single list of the app's own navigation entries, read by the desktop
 * sidebar (components/ui/sidebar-moderna.tsx), the mobile drawer
 * (components/ui/header-movil.tsx) and the mobile bottom bar
 * (components/ui/menu-inferior-movil.tsx).
 *
 * Who sees an entry is decided only by `roles` / `capabilities`, through
 * canAccess (lib/navigation/canAccess.ts), exactly as before the registry.
 * Sections built from the session — Dream Team, Niños and the platform
 * navigation items — keep their own modules and are composed in
 * components/navegacion/use-entradas-navegacion.ts.
 */

export type IconoNavegacion = ComponentType<{ className?: string }>

/** principal: the main list; pie: the footer links; cuenta: the account link next to Tema / Cerrar sesión. */
export type GrupoNavegacion = 'principal' | 'pie' | 'cuenta'

export interface SubEntradaNavegacion {
  id: string
  label: string
  href: string
  icon?: IconoNavegacion
  /** Roles that can see it. Undefined: everyone. */
  roles?: string[]
  /** Support capabilities that can see it. Undefined: everyone. */
  capabilities?: string[]
}

export interface EntradaNavegacion extends SubEntradaNavegacion {
  icon: IconoNavegacion
  grupo: GrupoNavegacion
  children?: SubEntradaNavegacion[]
  /** Position in the mobile bottom bar (1 = first). Undefined: not in the bottom bar. */
  prioridadMovil?: number
}

export interface CredencialesNavegacion {
  roles: string[]
  supportCapabilities: string[]
}

export const ROLES_DIRECCION = ['admin', 'pastor', 'director-general']
const ROLES_DIRECCION_ETAPA = [...ROLES_DIRECCION, 'director-etapa']
const ROLES_ADMIN_PASTOR = ['admin', 'pastor']

export const ENTRADAS_NAVEGACION: readonly EntradaNavegacion[] = [
  { id: 'dashboard', label: 'Dashboard', icon: Home, href: '/dashboard', grupo: 'principal', prioridadMovil: 1 },
  {
    id: 'usuarios',
    label: 'Usuarios',
    icon: Users,
    href: '/users',
    grupo: 'principal',
    roles: [...ROLES_DIRECCION_ETAPA, 'lider'],
    prioridadMovil: 2,
  },
  {
    id: 'grupos-vida',
    label: 'Grupos de Vida',
    icon: UserCheck,
    href: '/grupos-vida',
    grupo: 'principal',
    prioridadMovil: 3,
    children: [
      { id: 'gv-casas', label: 'Casas Anfitrionas', href: '/grupos-vida/casas-anfitrionas', icon: House, roles: ROLES_DIRECCION_ETAPA },
      { id: 'gv-segmentos', label: 'Segmentos', href: '/grupos-vida/segmentos', icon: Users, roles: ROLES_DIRECCION_ETAPA },
      { id: 'gv-directores', label: 'Directores', href: '/grupos-vida/directores', icon: UserCog, roles: ROLES_DIRECCION },
      { id: 'gv-temporadas', label: 'Temporadas', href: '/grupos-vida/temporadas', icon: Calendar, roles: ROLES_DIRECCION },
      { id: 'gv-mapa', label: 'Mapa', href: '/grupos-vida/mapa', icon: MapPin, roles: ROLES_DIRECCION_ETAPA },
      { id: 'gv-reportes', label: 'Reportes', href: '/grupos-vida/reportes/asistencia-semanal', icon: BarChart3, roles: ROLES_DIRECCION_ETAPA },
      // Named after the page it opens ("Salud de los Grupos"), not its URL.
      { id: 'gv-riesgo', label: 'Salud de los Grupos', href: '/grupos-vida/dashboard-riesgo', icon: ShieldAlert, roles: ROLES_DIRECCION_ETAPA },
      { id: 'gv-solicitudes', label: 'Solicitudes', href: '/grupos-vida/solicitudes', icon: ClipboardList, roles: ROLES_DIRECCION_ETAPA },
      { id: 'gv-config', label: 'Configuración', href: '/grupos-vida/configuracion', icon: Settings, roles: ROLES_ADMIN_PASTOR },
    ],
  },
  {
    id: 'configuracion-global',
    label: 'Configuración',
    icon: Settings,
    href: '/configuracion',
    grupo: 'principal',
    roles: ROLES_DIRECCION,
    children: [
      { id: 'config-general', label: 'General', href: '/configuracion', icon: Settings, roles: ROLES_ADMIN_PASTOR },
      {
        id: 'config-soporte',
        label: 'Configuración de soporte',
        href: '/configuracion/soporte',
        icon: Settings,
        roles: ROLES_DIRECCION,
        capabilities: ['support.manage'],
      },
    ],
  },
  {
    id: 'soporte-admin',
    label: 'Cola de soporte',
    icon: Inbox,
    href: '/ayuda/admin',
    grupo: 'principal',
    capabilities: ['support.view', 'support.reply', 'support.manage'],
  },
  { id: 'actualizaciones', label: 'Actualizaciones', icon: Megaphone, href: '/actualizaciones', grupo: 'pie' },
  { id: 'ayuda', label: 'Ayuda', icon: HelpCircle, href: '/ayuda', grupo: 'pie', prioridadMovil: 4 },
  { id: 'perfil', label: 'Mi Perfil', icon: User, href: '/perfil', grupo: 'cuenta' },
]

export function entradasDelGrupo(grupo: GrupoNavegacion): EntradaNavegacion[] {
  return ENTRADAS_NAVEGACION.filter((entrada) => entrada.grupo === grupo)
}

/** Entries the credentials can see, each with only the children it can see. */
export function filtrarVisibles<T extends SubEntradaNavegacion & { children?: SubEntradaNavegacion[] }>(
  entradas: readonly T[],
  credenciales: CredencialesNavegacion,
): T[] {
  return entradas
    .filter((entrada) => canAccess(entrada, credenciales))
    .map((entrada) =>
      entrada.children
        ? { ...entrada, children: entrada.children.filter((hija) => canAccess(hija, credenciales)) }
        : entrada,
    )
}

/** The bottom bar's own entries (when it is not showing platform items), in bar order. */
export function entradasBarraInferior(credenciales: CredencialesNavegacion): EntradaNavegacion[] {
  return filtrarVisibles(
    ENTRADAS_NAVEGACION.filter((entrada) => entrada.prioridadMovil !== undefined),
    credenciales,
  ).sort((a, b) => (a.prioridadMovil ?? 0) - (b.prioridadMovil ?? 0))
}

/** The route is the entry or below it. /dashboard only matches itself. */
export function esRutaActiva(pathname: string | null | undefined, href: string): boolean {
  if (!pathname) return false
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'))
}

/** A parent is active on its own route or on any child's route. */
export function esEntradaActiva(
  pathname: string | null | undefined,
  entrada: { href: string; children?: readonly { href: string }[] },
): boolean {
  if (entrada.children?.length) {
    return pathname === entrada.href || entrada.children.some((hija) => esRutaActiva(pathname, hija.href))
  }
  return esRutaActiva(pathname, entrada.href)
}
