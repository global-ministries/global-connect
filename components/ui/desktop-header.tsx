"use client"

import React from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { cn } from '@/lib/utils'
import { CLASE_BOTON_ICONO_SHELL } from '@/components/navegacion/estilos-navegacion'
import { CampanaNotificaciones } from '@/components/navegacion/campana-notificaciones'
import { MenuCuenta } from '@/components/navegacion/menu-cuenta'

interface DesktopHeaderProps {
    titulo?: string
    /** The page's one primary action; pass it at the small size (`tamaño="sm"`). */
    accionPrincipal?: React.ReactNode
    breadcrumbs?: React.ReactNode
    botonRegreso?: { href: string; texto: string }
}

/**
 * The sticky desktop and tablet header (≥ md) of the app shell
 * (docs/design-system/layout.md, "Desktop header"; prototype design/app-shell):
 * 64px, the page surface with a light system-bar blur and a hairline, no shadow.
 *
 * Left: back link and the breadcrumb, or the page title. Right: the primary
 * action, the notifications bell (always visible) and the account menu, which
 * holds the theme, Mi perfil and Cerrar sesión.
 *
 * With breadcrumbs the last crumb names the page, so the title stays as the
 * page's `h1` for assistive tech only.
 */
export function DesktopHeader({ titulo, accionPrincipal, breadcrumbs, botonRegreso }: DesktopHeaderProps) {
    return (
        <div
            data-slot="desktop-header"
            className={cn(
                "sticky top-0 z-20 hidden min-h-16 items-center gap-3 md:flex",
                "border-b border-border/60 bg-[color-mix(in_oklab,var(--surface-primary)_85%,transparent)] backdrop-blur-md",
                "px-6 lg:px-12",
            )}
        >
            <div className="flex min-w-0 flex-1 items-center gap-2">
                {botonRegreso && (
                    <Link
                        href={botonRegreso.href}
                        aria-label={`Volver a ${botonRegreso.texto}`}
                        className={cn(CLASE_BOTON_ICONO_SHELL, "-ml-3")}
                    >
                        <ArrowLeft aria-hidden="true" className="size-5" />
                    </Link>
                )}
                {breadcrumbs ? (
                    <>
                        <div className="min-w-0 flex-1 overflow-hidden">{breadcrumbs}</div>
                        {titulo && <h1 className="sr-only">{titulo}</h1>}
                    </>
                ) : (
                    titulo && <h1 className="truncate text-lg font-semibold text-foreground">{titulo}</h1>
                )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
                {accionPrincipal && <div className="shrink-0">{accionPrincipal}</div>}
                <CampanaNotificaciones />
                <MenuCuenta />
            </div>
        </div>
    )
}
