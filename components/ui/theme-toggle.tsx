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
                    "w-9 h-9 rounded-xl bg-[var(--surface-secondary)] animate-pulse",
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
                "w-9 h-9 min-h-[44px] min-w-[44px]",
                "bg-[var(--surface-secondary)] hover:bg-[var(--brand-accent)]",
                "border border-[var(--glass-border)]",
                "transition-[background-color,border-color,transform] duration-200 ease-expo",
                "press-scale focus-ring touch-manipulation",
                className
            )}
        >
            <Icon className="w-full h-full text-foreground transition-transform duration-300 ease-expo" />
        </button>
    )
}
