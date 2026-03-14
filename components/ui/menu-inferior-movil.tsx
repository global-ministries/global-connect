"use client"

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, UsersRound, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNotificaciones } from '@/hooks/use-notificaciones'

const elementosMenu = [
  { nombre: "Dashboard", icono: LayoutDashboard, enlace: "/dashboard", id: "dashboard" },
  { nombre: "Usuarios", icono: Users, enlace: "/users", id: "users" },
  { nombre: "Grupos de Vida", icono: UsersRound, enlace: "/grupos-vida", id: "grupos-vida" },
  { nombre: "Ayuda", icono: HelpCircle, enlace: null, id: "ayuda" },
]

export function MenuInferiorMovil() {
  const pathname = usePathname()
  const toast = useNotificaciones()

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/60 dark:bg-[rgba(35,35,45,0.60)] backdrop-blur-[40px] [-webkit-backdrop-filter:blur(40px)] backdrop-saturate-[1.8] border-t border-[var(--glass-border)] shadow-[var(--glass-shadow)] [transform:translateZ(0)] touch-manipulation">
      <div className="flex items-center justify-around px-2 py-2 safe-area-pb">
        {elementosMenu.map((elemento) => {
          const Icono = elemento.icono

          // Ayuda → toast
          if (!elemento.enlace) {
            return (
              <button
                key={elemento.id}
                onClick={() => toast.info('Próximamente')}
                aria-label={elemento.nombre}
                className={cn(
                  "flex flex-col items-center justify-center px-3 py-2 rounded-xl min-w-0 flex-1 min-h-[44px]",
                  "transition-[background-color,color,transform] duration-200 ease-expo",
                  "press-scale focus-ring",
                  "text-muted-foreground hover:text-[var(--brand-primary)] hover:bg-[var(--brand-accent)]"
                )}
              >
                <Icono className="w-5 h-5 mb-1 text-muted-foreground" />
                <span className="text-xs font-medium truncate max-w-full text-muted-foreground">
                  {elemento.nombre}
                </span>
              </button>
            )
          }

          const esActivo = pathname === elemento.enlace ||
            (elemento.enlace !== "/dashboard" && pathname?.startsWith(elemento.enlace))

          return (
            <Link
              key={elemento.id}
              href={elemento.enlace}
              aria-label={`Navegar a ${elemento.nombre}`}
              aria-current={esActivo ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center px-3 py-2 rounded-xl min-w-0 flex-1 min-h-[44px]",
                "transition-[background-color,color,transform] duration-200 ease-expo",
                "press-scale focus-ring",
                esActivo
                  ? "bg-[var(--brand-accent)] text-[var(--brand-primary)]"
                  : "text-muted-foreground hover:text-[var(--brand-primary)] hover:bg-[var(--brand-accent)]"
              )}
            >
              <Icono className={cn("w-5 h-5 mb-1", esActivo ? "text-[var(--brand-primary)]" : "text-muted-foreground")} />
              <span className={cn(
                "text-xs font-medium truncate max-w-full",
                esActivo ? "text-[var(--brand-primary)]" : "text-muted-foreground"
              )}>
                {elemento.nombre}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
