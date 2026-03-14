"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Sun, Moon, Monitor } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Toggle de tema: light → dark → system
 * Diseño Liquid Glass con animación de ícono rotante.
 */
export function ThemeToggle({ className }: { className?: string }) {
    const { theme, setTheme } = useTheme()
    const [mounted, setMounted] = useState(false)

    useEffect(() => setMounted(true), [])

    if (!mounted) {
        return (
            <div
                className={cn(
                    "w-9 h-9 rounded-xl animate-pulse",
                    className
                )}
            />
        )
    }

    const cycle = () => {
        if (theme === "light") setTheme("dark")
        else if (theme === "dark") setTheme("system")
        else setTheme("light")
    }

    const label =
        theme === "light"
            ? "Cambiar a modo oscuro"
            : theme === "dark"
                ? "Cambiar a modo sistema"
                : "Cambiar a modo claro"

    const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor

    return (
        <button
            onClick={cycle}
            aria-label={label}
            title={label}
            className={cn(
                "relative flex items-center justify-center rounded-xl",
                "w-9 h-9",
                "hover:bg-[var(--brand-accent)]",
                "transition-[background-color,transform] duration-200 ease-expo",
                "press-scale focus-ring touch-manipulation",
                className
            )}
        >
            <Icon className="w-5 h-5 text-muted-foreground transition-transform duration-300 ease-expo" />
        </button>
    )
}
