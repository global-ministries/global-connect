"use client"

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { LogoGlobalConnect } from '@/components/ui/logo-global-connect'
import { cn } from '@/lib/utils'
import { useBranding } from '@/hooks/useBranding'
import { CampanaNotificaciones } from '@/components/navegacion/campana-notificaciones'
import { useEntradasNavegacion, type EntradaMenu } from '@/components/navegacion/use-entradas-navegacion'
import { ENTRADAS_NAVEGACION } from '@/lib/navegacion/registro'

// ── Título inteligente por ruta ──
// Sub-páginas específicas (orden: más específico primero)
const RUTAS_INTERNAS: [RegExp | string, string][] = [
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
  // The Equipo tab's root page (components/navegacion/accesos-seccion.tsx).
  ['/dream-team', 'Dream Team'],
  [/^\/dream-team\/mi-equipo/, 'Mi equipo'],
  [/^\/admin\/dream-team\/servidores/, 'Servidores'],
  [/^\/admin\/dream-team\/estructura/, 'Estructura'],
  ['/configuracion', 'Configuración'],
  ['/actualizaciones', 'Actualizaciones'],
  ['/ayuda', 'Ayuda'],
  ['/perfil', 'Mi perfil'],
]

/** The page title, or null on /dashboard (Inicio), which shows the logo. */
function resolverTitulo(path: string | null, entradas: readonly EntradaMenu[]): string | null {
  if (!path || path === '/dashboard') return null

  for (const [pattern, label] of RUTAS_INTERNAS) {
    if (typeof pattern === 'string' ? path === pattern : pattern.test(path)) {
      return label
    }
  }

  // Fallback: top-level menu items
  const titleItems: readonly EntradaMenu[] = [...entradas, ...ENTRADAS_NAVEGACION]
  return titleItems.find(it => path.startsWith(it.href) && it.href !== '/dashboard')?.label ?? 'Global'
}

interface HeaderMovilProps {
  titulo?: string
}

/**
 * The phone top bar (odd/tasks/sistema-diseno-v2.md, S9.6; prototype
 * design/app-shell/03-celular.html), visible below md: the page title (the
 * logo on Inicio) and the notifications bell, with the BarraNavegacionMovil
 * look. There is no menu here: the tab bar and its "Más" sheet
 * (components/ui/menu-inferior-movil.tsx) hold the navigation.
 */
export function HeaderMovil({ titulo }: HeaderMovilProps) {
  const pathname = usePathname()
  const { principales } = useEntradasNavegacion()
  const branding = useBranding()
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

  const tituloResuelto = resolverTitulo(pathname, principales)

  return (
    <div
      className={cn(
        "md:hidden fixed top-0 left-0 right-0 z-40 touch-manipulation",
        "bg-background/72 backdrop-blur-xl backdrop-saturate-150",
        "border-b transition-colors duration-200 motion-reduce:transition-none",
        scrolled ? "border-border" : "border-transparent"
      )}
    >
      <div className={cn(
        // Height: the top inset (at least 12px) + a 44px row + 8px (4px once
        // scrolled). The (auth) layout offsets the page by the uncompacted height.
        "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-2 safe-area-pt safe-area-pl safe-area-pr",
        "transition-[padding] duration-300 ease-expo motion-reduce:transition-none",
        scrolled ? "pb-1" : "pb-2"
      )}>
        {/* Center: Logo on Inicio, page title otherwise */}
        <div className="col-start-2 flex min-h-11 min-w-0 items-center justify-center">
          {tituloResuelto === null ? (
            <LogoGlobalConnect tamaño="sm" logoLightUrl={branding.logoLightUrl} logoDarkUrl={branding.logoDarkUrl} className={cn(
              "h-auto transition-[width] duration-300 ease-expo",
              scrolled ? "w-[72px]" : "w-[80px]"
            )} />
          ) : (
            <h1 className={cn(
              "max-w-[180px] truncate font-semibold text-foreground",
              "transition-[font-size] duration-300 ease-expo motion-reduce:transition-none",
              scrolled ? "text-sm" : "text-base"
            )}>
              {titulo ?? tituloResuelto}
            </h1>
          )}
        </div>

        {/* Right: the bell, always visible (S9.9) */}
        <div className="col-start-3 flex min-w-0 justify-end">
          <CampanaNotificaciones presentacion="hoja" />
        </div>
      </div>
    </div>
  )
}
