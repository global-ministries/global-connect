"use client"

import { useState } from "react"

export function usarSidebar() {
  const [sidebarAbierto, setSidebarAbierto] = useState(false)

  const alternarSidebar = () => {
    setSidebarAbierto(!sidebarAbierto)
  }

  const cerrarSidebar = () => {
    setSidebarAbierto(false)
  }

  const abrirSidebar = () => {
    setSidebarAbierto(true)
  }

  return {
    sidebarAbierto,
    alternarSidebar,
    cerrarSidebar,
    abrirSidebar
  }
}
