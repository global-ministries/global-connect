"use client"

import React, { useState } from "react"
import { LayoutDashboard, Users, UsersRound, Target, Calendar, Settings, Globe, Menu, X } from "lucide-react"
import Link from "next/link"
import { AuthStatusDebug } from "@/components/auth/AuthStatusDebug"

interface PropiedadesLayoutTablero {
  children: React.ReactNode
}

export default function LayoutTablero({ children }: PropiedadesLayoutTablero) {
  const [sidebarAbierto, setSidebarAbierto] = useState(false)

  const elementosMenu = [
    { nombre: "Dashboard", icono: LayoutDashboard, enlace: "/dashboard" },
    { nombre: "Usuarios", icono: Users, enlace: "/dashboard/users" },
    { nombre: "Grupos", icono: UsersRound, enlace: "/grupos" },
    { nombre: "Segmentos", icono: Target, enlace: "/segmentos" },
    { nombre: "Temporadas", icono: Calendar, enlace: "/temporadas" },
    { nombre: "ConfiguraciÃ³n", icono: Settings, enlace: "/configuracion" },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-gray-50 to-white relative overflow-hidden">
      {/* Orbes flotantes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-32 h-32 bg-gradient-to-br from-orange-300/30 to-orange-400/30 rounded-full blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-32 w-24 h-24 bg-gradient-to-br from-gray-300/25 to-orange-300/25 rounded-full blur-lg animate-bounce" style={{animationDuration: '3s'}}></div>
        <div className="absolute bottom-32 left-32 w-40 h-40 bg-gradient-to-br from-orange-200/20 to-gray-200/20 rounded-full blur-2xl animate-pulse" style={{animationDelay: '1s'}}></div>
        <div className="absolute bottom-20 right-20 w-28 h-28 bg-gradient-to-br from-orange-400/30 to-orange-300/30 rounded-full blur-xl animate-bounce" style={{animationDuration: '4s', animationDelay: '0.5s'}}></div>
      </div>
      
      <div className="relative z-10">
        {/* BotÃ³n de MenÃº MÃ³vil */}
        <div className="lg:hidden fixed top-4 left-4 z-50">
          <button
            onClick={() => setSidebarAbierto(!sidebarAbierto)}
            className="p-3 bg-white/30 backdrop-blur-xl border border-white/50 rounded-2xl shadow-lg hover:bg-orange-50/50 transition-all duration-200"
          >
            {sidebarAbierto ? <X className="w-6 h-6 text-gray-700" /> : <Menu className="w-6 h-6 text-gray-700" />}
          </button>
        </div>

        {/* Overlay MÃ³vil */}
        {sidebarAbierto && (
          <div
            className="lg:hidden fixed inset-0 bg-black/20 backdrop-blur-sm z-30"
            onClick={() => setSidebarAbierto(false)}
          />
        )}

        <div className="flex">
          {/* Barra Lateral */}
          <div
            className={`fixed lg:static inset-y-0 left-0 z-40 w-64 transform transition-transform duration-300 ease-in-out lg:transform-none ${
              sidebarAbierto ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
            }`}
          >
            <div className="h-full p-4 lg:p-6 flex flex-col justify-between">
              <div>
                <div className="backdrop-blur-2xl bg-white/30 border border-white/50 rounded-3xl p-4 lg:p-6 shadow-2xl h-full flex flex-col">
                  {/* Logo */}
                  <div className="flex items-center justify-center mb-8">
                    <img 
                      src="/logo.png" 
                      alt="Global Connect" 
                      className="h-14 w-auto lg:h-16 lg:w-auto max-w-[240px]"
                    />
                  </div>

                  {/* MenÃº de NavegaciÃ³n */}
                  <nav className="space-y-2 flex-1">
                    {elementosMenu.map((elemento) => {
                      const Icono = elemento.icono

                      return (
                        <Link
                          key={elemento.nombre}
                          href={elemento.enlace}
                          onClick={() => setSidebarAbierto(false)}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-gray-700 hover:bg-gradient-to-r hover:from-orange-100/60 hover:to-orange-50/60 hover:text-orange-600"
                        >
                          <Icono className="w-5 h-5" />
                          <span className="font-medium">{elemento.nombre}</span>
                        </Link>
                      )
                    })}
                  </nav>
                </div>
              </div>
              {/* AuthStatusDebug al fondo de la sidebar */}
              <div className="mt-6 flex flex-col items-center">
                <AuthStatusDebug />
                {/* Logo de la versión o info de versión aquí si existe */}
                {/* <div className="text-xs text-gray-400 mt-2">v1.0.0</div> */}
              </div>
            </div>
          </div>

          {/* Contenido Principal */}
          <div className="flex-1 lg:ml-0 p-4 lg:p-6 pt-20 lg:pt-6">{children}</div>
        </div>
      </div>
    </div>
  )
}