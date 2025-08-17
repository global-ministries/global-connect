"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LucideIcon } from "lucide-react"
import { ReactNode } from "react"

interface CampoInputConIconoProps {
  id: string
  etiqueta: string
  tipo?: string
  valor: string
  alCambiar: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  Icono: LucideIcon
  botonDerecha?: ReactNode
  claseAdicional?: string
}

export function CampoInputConIcono({
  id,
  etiqueta,
  tipo = "text",
  valor,
  alCambiar,
  placeholder,
  Icono,
  botonDerecha,
  claseAdicional = ""
}: CampoInputConIconoProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-gray-700 font-medium text-sm sm:text-base">
        {etiqueta}
      </Label>
      <div className="relative">
        <Icono className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        <Input
          id={id}
          type={tipo}
          value={valor}
          onChange={alCambiar}
          className={`pl-10 ${botonDerecha ? 'pr-10' : ''} bg-white/50 border-white/30 rounded-xl h-12 focus:bg-white/70 transition-all duration-200 text-sm sm:text-base ${claseAdicional}`}
          placeholder={placeholder}
        />
        {botonDerecha && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            {botonDerecha}
          </div>
        )}
      </div>
    </div>
  )
}
