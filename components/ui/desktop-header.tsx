"use client"

import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut, User, ArrowLeft, Bell, HelpCircle } from 'lucide-react'
import { logout } from "@/lib/actions/auth.actions"
import { ThemeToggle } from './theme-toggle'
import { UserAvatar } from './UserAvatar'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { cn } from '@/lib/utils'
import { useNotificaciones } from '@/hooks/use-notificaciones'

function formatearRol(roles: string[]): string {
    if (!roles || roles.length === 0) return 'Usuario'
    const map: Record<string, string> = {
        admin: 'Administrador', lider: 'Líder',
        coordinador: 'Coordinador', voluntario: 'Voluntario',
        miembro: 'Miembro',
    }
    return map[roles[0]] ?? roles[0].charAt(0).toUpperCase() + roles[0].slice(1)
}

interface DesktopHeaderProps {
    titulo?: string
    accionPrincipal?: React.ReactNode
    breadcrumbs?: React.ReactNode
    botonRegreso?: { href: string; texto: string }
}

/**
 * Header desktop sticky con breadcrumbs, título de página, acciones y menú de usuario.
 * Efecto liquid glass con blur. Visible solo en pantallas ≥ md (768px).
 */
export function DesktopHeader({ titulo, accionPrincipal, breadcrumbs, botonRegreso }: DesktopHeaderProps) {
    const [scrolled, setScrolled] = useState(false)
    const [userMenuOpen, setUserMenuOpen] = useState(false)
    const { usuario, roles, loading } = useCurrentUser()
    const toast = useNotificaciones()
    const userMenuRef = useRef<HTMLDivElement>(null)
    const pathname = usePathname()
    const headerRef = useRef<HTMLDivElement>(null)

    // Scroll detection — find the actual scrolling ancestor (main)
    useEffect(() => {
        const scrollContainer = headerRef.current?.closest('main') ?? window
        const handler = () => {
            const y = scrollContainer === window
                ? window.scrollY
                : (scrollContainer as HTMLElement).scrollTop
            setScrolled(y > 10)
        }
        scrollContainer.addEventListener('scroll', handler, { passive: true })
        return () => scrollContainer.removeEventListener('scroll', handler)
    }, [])

    // Close popover on outside click
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

    // Close on route change
    useEffect(() => {
        setUserMenuOpen(false)
    }, [pathname])

    return (
        <div
            ref={headerRef}
            className={cn(
                "hidden md:block sticky top-0 z-10",
                "bg-white/60 dark:bg-[rgba(35,35,45,0.60)] backdrop-blur-[40px] [-webkit-backdrop-filter:blur(40px)] backdrop-saturate-[1.8]",
                "border-b border-[var(--glass-border)] shadow-[var(--glass-shadow)]",
                "[transform:translateZ(0)]",
                "px-6 lg:px-12",
                "transition-[padding] duration-300 ease-expo",
                scrolled ? "py-2" : "py-3"
            )}
        >
            {breadcrumbs && (
                <div className="mb-2">{breadcrumbs}</div>
            )}

            <div className="flex items-center justify-between gap-4">
                {/* Left: title + back button */}
                <div className="flex items-center gap-4 min-w-0">
                    {botonRegreso && (
                        <Link
                            href={botonRegreso.href}
                            className="p-2 rounded-xl hover:bg-[var(--brand-accent)] transition-[background-color,transform] duration-200 ease-expo press-scale focus-ring flex-shrink-0"
                        >
                            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
                        </Link>
                    )}
                    {titulo && (
                        <h1 className={cn(
                            "font-semibold text-foreground truncate",
                            "transition-[font-size] duration-300 ease-expo",
                            scrolled ? "text-base" : "text-lg"
                        )}>
                            {titulo}
                        </h1>
                    )}
                    {accionPrincipal && (
                        <div className="flex-shrink-0">{accionPrincipal}</div>
                    )}
                </div>

                {/* Right: theme toggle + user avatar popover */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    <ThemeToggle />

                    <Link
                        href="/ayuda"
                        aria-label="Ayuda"
                        className="relative flex items-center justify-center rounded-xl w-9 h-9 hover:bg-[var(--brand-accent)] transition-[background-color,transform] duration-200 ease-expo press-scale focus-ring touch-manipulation"
                    >
                        <HelpCircle className="w-5 h-5 text-muted-foreground" />
                    </Link>

                    {/* Notification bell */}
                    <button
                        onClick={() => toast.info('Próximamente')}
                        aria-label="Notificaciones"
                        className="relative flex items-center justify-center rounded-xl w-9 h-9 hover:bg-[var(--brand-accent)] transition-[background-color,transform] duration-200 ease-expo press-scale focus-ring touch-manipulation"
                    >
                        <Bell className="w-5 h-5 text-muted-foreground" />
                    </button>

                    {/* User section */}
                    <div className="relative" ref={userMenuRef}>
                        <button
                            onClick={() => setUserMenuOpen(prev => !prev)}
                            aria-label="Menú de usuario"
                            aria-expanded={userMenuOpen}
                            className="flex items-center gap-2.5 pl-2.5 pr-3 py-1.5 rounded-xl hover:bg-[var(--brand-accent)] transition-[background-color,transform] duration-200 ease-expo press-scale focus-ring"
                        >
                            {loading ? (
                                <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
                            ) : usuario ? (
                                <>
                                    <UserAvatar
                                        photoUrl={usuario.foto_perfil_url}
                                        nombre={usuario.nombre}
                                        apellido={usuario.apellido}
                                        size="sm"
                                    />
                                    <div className="text-left hidden lg:block">
                                        <p className="text-sm font-medium text-foreground leading-tight truncate max-w-[140px]">
                                            {usuario.nombre} {usuario.apellido}
                                        </p>
                                        <p className="text-xs text-[var(--brand-primary)] font-medium leading-tight">
                                            {formatearRol(roles)}
                                        </p>
                                    </div>
                                </>
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                    <User className="w-4 h-4 text-muted-foreground" />
                                </div>
                            )}
                        </button>

                        {/* User Popover */}
                        {userMenuOpen && (
                            <div className="absolute top-full right-0 mt-2 w-[220px] glass-panel-elevated rounded-2xl border border-[var(--glass-border)] shadow-xl overflow-hidden animate-slide-down-fade z-50">
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

                                <div className="py-1">
                                    <Link
                                        href="/perfil"
                                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-[var(--brand-accent)] transition-[background-color,transform] duration-150 press-scale focus-ring touch-manipulation"
                                    >
                                        <User className="w-4 h-4 text-muted-foreground" />
                                        Mi Perfil
                                    </Link>

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
        </div>
    )
}
