"use client"

import React from 'react'
import Link from 'next/link'
import { LogoGlobalConnect } from '@/components/ui/logo-global-connect'
import { logout } from "@/lib/actions/auth.actions"
import { LogOut, User } from 'lucide-react'

export function HeaderMovil() {
  return (
    <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-b border-gray-200/50 shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 safe-area-pt">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <LogoGlobalConnect tamaño="sm" />
          <span className="font-semibold text-gray-900">Global Connect</span>
        </div>
        
        {/* Botones de perfil y logout */}
        <div className="flex items-center gap-2">
          {/* Botón de perfil */}
          <Link href="/dashboard/perfil">
            <button className="p-2 rounded-lg text-gray-600 hover:text-orange-600 hover:bg-orange-50/50 transition-all duration-200">
              <User className="w-5 h-5" />
            </button>
          </Link>
          
          {/* Botón de logout */}
          <form action={logout}>
            <button
              type="submit"
              className="p-2 rounded-lg text-gray-600 hover:text-orange-600 hover:bg-orange-50/50 transition-all duration-200"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
