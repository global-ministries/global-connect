"use client"

import React from 'react'
import { TextoSistema } from './sistema-diseno'
import { ChevronDown } from 'lucide-react'

interface MobileScrollIndicatorProps {
  show: boolean
}

export function MobileScrollIndicator({ show }: MobileScrollIndicatorProps) {
  if (!show) return null

  return (
    <div className="md:hidden fixed bottom-20 left-1/2 transform -translate-x-1/2 z-10 animate-bounce">
      <div className="bg-orange-500 text-white px-3 py-2 rounded-full shadow-lg flex items-center gap-2">
        <TextoSistema tamaño="sm" className="text-white font-medium">
          Desliza para ver más
        </TextoSistema>
        <ChevronDown className="w-4 h-4" />
      </div>
    </div>
  )
}
