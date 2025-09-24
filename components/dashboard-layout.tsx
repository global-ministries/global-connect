"use client"

import type React from "react"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { LayoutDashboard, Users, UsersRound, Target, Calendar, Settings, Globe, Menu, X } from "lucide-react"
import Link from "next/link"

interface DashboardLayoutProps {
  children: React.ReactNode
  activeMenuItem: string
}

export default function DashboardLayout({ children, activeMenuItem }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
    { name: "Usuarios", icon: Users, href: "/usuarios" },
    { name: "Grupos", icon: UsersRound, href: "/grupos" },
    { name: "Segmentos", icon: Target, href: "/segmentos" },
    { name: "Temporadas", icon: Calendar, href: "/temporadas" },
    { name: "Configuración", icon: Settings, href: "/configuracion" },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-200 via-purple-100 to-white relative overflow-hidden">
      {/* Floating Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-32 h-32 bg-gradient-to-br from-purple-400/30 to-pink-400/30 rounded-full blur-xl animate-pulse"></div>
        <div
          className="absolute top-40 right-32 w-24 h-24 bg-gradient-to-br from-blue-400/25 to-purple-400/25 rounded-full blur-lg animate-bounce"
          style={{ animationDuration: "3s" }}
        ></div>
        <div
          className="absolute bottom-32 left-32 w-40 h-40 bg-gradient-to-br from-pink-300/20 to-purple-300/20 rounded-full blur-2xl animate-pulse"
          style={{ animationDelay: "1s" }}
        ></div>
        <div
          className="absolute bottom-20 right-20 w-28 h-28 bg-gradient-to-br from-indigo-400/30 to-blue-400/30 rounded-full blur-xl animate-bounce"
          style={{ animationDuration: "4s", animationDelay: "0.5s" }}
        ></div>
      </div>

      {/* Mobile Menu Button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-3 bg-white/30 backdrop-blur-xl border border-white/50 rounded-2xl shadow-lg hover:bg-white/40 transition-all duration-200"
        >
          {sidebarOpen ? <X className="w-6 h-6 text-gray-700" /> : <Menu className="w-6 h-6 text-gray-700" />}
        </button>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/20 backdrop-blur-sm z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex relative z-10">
        {/* Sidebar */}
        <div
          className={`fixed lg:static inset-y-0 left-0 z-40 w-64 transform transition-transform duration-300 ease-in-out lg:transform-none ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          }`}
        >
          <div className="h-full p-4 lg:p-6">
            <Card className="backdrop-blur-2xl bg-white/30 border border-white/50 rounded-3xl p-4 lg:p-6 shadow-2xl h-full">
              {/* Logo */}
              <div className="flex items-center gap-3 mb-8">
                <div className="rounded-2xl bg-white p-1.5 shadow-md ring-1 ring-orange-200/60">
                  <img src={process.env.NEXT_PUBLIC_LOGO_URL || "https://wcnqocyqtksxhthnquta.supabase.co/storage/v1/object/public/logos/Logo%20global.jpg"} alt="Global Connect" className="h-12 w-auto rounded-xl" />
                </div>
              </div>

              {/* Navigation Menu */}
              <nav className="space-y-2">
                {menuItems.map((item) => {
                  const Icon = item.icon
                  const isActive = activeMenuItem === item.name

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                        isActive
                          ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg"
                          : "text-gray-700 hover:bg-white/50"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="font-medium">{item.name}</span>
                    </Link>
                  )
                })}
              </nav>
            </Card>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 lg:ml-0 p-4 lg:p-6 pt-20 lg:pt-6">{children}</div>
      </div>
    </div>
  )
}
