import React from "react"
import TopDebugBar from "@/components/auth/TopDebugBar.client"
import { HeaderMovil } from "@/components/ui/header-movil"
import { MenuInferiorMovil } from "@/components/ui/menu-inferior-movil"

interface PropiedadesLayoutTablero {
  children: React.ReactNode
}

export default function LayoutTablero({ children }: PropiedadesLayoutTablero) {
  return (
    <div className="min-h-screen bg-gray-50">
      <TopDebugBar />
      <HeaderMovil />
      <div className="pt-16 pb-20 md:pt-0 md:pb-0">
        {children}
      </div>
      <MenuInferiorMovil />
    </div>
  )
}