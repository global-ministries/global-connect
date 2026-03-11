import React from "react"
import { HeaderMovil } from "@/components/ui/header-movil"
import { MenuInferiorMovil } from "@/components/ui/menu-inferior-movil"
import { CampusProvider } from "@/hooks/useCampus"

interface PropiedadesLayoutTablero {
  children: React.ReactNode
}

export default function LayoutTablero({ children }: PropiedadesLayoutTablero) {
  return (
    <CampusProvider>
      <div className="min-h-screen bg-[var(--surface-primary)]">
        <HeaderMovil />
        <div className="pt-16 pb-20 md:pt-0 md:pb-0">
          {children}
        </div>
        <MenuInferiorMovil />
      </div>
    </CampusProvider>
  )
}