"use client"

import Link from "next/link"
import { Plus, LucideIcon } from "lucide-react"

interface BotonFlotanteProps {
    /** URL de destino (usa Link) o onClick si es acción */
    href?: string
    /** Callback para acción directa (se ignora si hay href) */
    onClick?: () => void
    /** Ícono del botón (default: Plus) */
    icono?: LucideIcon
    /** Label accesible para screen readers */
    label?: string
    /** Clase CSS adicional */
    className?: string
}

/**
 * FAB (Floating Action Button) visible solo en móvil.
 * Posición: esquina inferior derecha, sobre el contenido.
 * Uso: acciones principales en vistas donde el header no muestra el botón en móvil.
 *
 * @example
 * <BotonFlotante href="/grupos-vida/casas-anfitrionas/nueva" label="Registrar casa" />
 * <BotonFlotante onClick={() => setOpen(true)} icono={MessageCircle} label="Nuevo mensaje" />
 */
export function BotonFlotante({
    href,
    onClick,
    icono: Icon = Plus,
    label = "Crear nuevo",
    className = "",
}: BotonFlotanteProps) {
    const classes = `
    fixed bottom-24 right-6 z-[60]
    w-14 h-14 rounded-full
    bg-gradient-to-br from-orange-500 to-orange-600
    text-white shadow-xl shadow-orange-500/25
    flex items-center justify-center
    active:scale-95 transition-transform duration-150
    md:hidden
    ${className}
  `.trim()

    if (href) {
        return (
            <Link href={href} className={classes} aria-label={label}>
                <Icon className="w-6 h-6" />
            </Link>
        )
    }

    return (
        <button type="button" onClick={onClick} className={classes} aria-label={label}>
            <Icon className="w-6 h-6" />
        </button>
    )
}
