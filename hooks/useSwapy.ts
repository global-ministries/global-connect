"use client"

import { useEffect, useRef, useState } from 'react'
import { createSwapy } from 'swapy'

interface UseSwapyOptions {
  onSwap?: (event: any) => void
}

export function useSwapy(options: UseSwapyOptions = {}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const swapyRef = useRef<any>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    // Detectar si es dispositivo móvil
    const checkMobile = () => {
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      const isSmallScreen = window.innerWidth < 768 // md breakpoint
      setIsMobile(isTouchDevice && isSmallScreen)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)

    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    // Solo inicializar Swapy en desktop
    if (!isMobile) {
      swapyRef.current = createSwapy(containerRef.current, {
        animation: 'dynamic'
      })

      // Configurar evento de intercambio
      if (options.onSwap) {
        swapyRef.current.onSwap(options.onSwap)
      }
    } else {
      // Destruir Swapy en móvil si existe
      if (swapyRef.current) {
        swapyRef.current.destroy()
        swapyRef.current = null
      }
    }

    return () => {
      if (swapyRef.current) {
        swapyRef.current.destroy()
      }
    }
  }, [options.onSwap, isMobile])

  return {
    containerRef,
    swapy: swapyRef.current,
    isMobile
  }
}
