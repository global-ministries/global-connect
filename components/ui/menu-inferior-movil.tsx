"use client"

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, UsersRound, Target, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

const elementosMenu = [
  { nombre: "Dashboard", icono: LayoutDashboard, enlace: "/dashboard", id: "dashboard" },
  { nombre: "Usuarios", icono: Users, enlace: "/dashboard/users", id: "users" },
  { nombre: "Grupos", icono: UsersRound, enlace: "/dashboard/grupos", id: "grupos" },
  { nombre: "Segmentos", icono: Target, enlace: "/dashboard/segments", id: "segments" },
  { nombre: "Temporadas", icono: Calendar, enlace: "/dashboard/temporadas", id: "temporadas" },
]

export function MenuInferiorMovil() {
  const pathname = usePathname()

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-gray-200/50 shadow-lg">
      <div className="flex items-center justify-around px-2 py-2 safe-area-pb">
        {elementosMenu.map((elemento) => {
          const Icono = elemento.icono
          const esActivo = pathname === elemento.enlace || 
            (elemento.enlace !== "/dashboard" && pathname?.startsWith(elemento.enlace))

          return (
            <Link
              key={elemento.id}
              href={elemento.enlace}
              className={cn(
                "flex flex-col items-center justify-center px-3 py-2 rounded-xl transition-all duration-200 min-w-0 flex-1",
                esActivo 
                  ? "bg-orange-100/80 text-orange-600" 
                  : "text-gray-600 hover:text-orange-500 hover:bg-orange-50/50"
              )}
            >
              <Icono className={cn("w-5 h-5 mb-1", esActivo ? "text-orange-600" : "text-gray-500")} />
              <span className={cn(
                "text-xs font-medium truncate max-w-full",
                esActivo ? "text-orange-600" : "text-gray-600"
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
