"use client"

import { useEffect, useRef } from 'react'
import { createSwapy } from 'swapy'

interface UseSwapyOptions {
  onSwap?: (event: any) => void
}

export function useSwapy(options: UseSwapyOptions = {}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const swapyRef = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Inicializar Swapy
    swapyRef.current = createSwapy(containerRef.current, {
      animation: 'dynamic'
    })

    // Configurar evento de intercambio
    if (options.onSwap) {
      swapyRef.current.onSwap(options.onSwap)
    }

    return () => {
      if (swapyRef.current) {
        swapyRef.current.destroy()
      }
    }
  }, [options.onSwap])

  return {
    containerRef,
    swapy: swapyRef.current
  }
}
