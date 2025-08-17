import { Button } from "@/components/ui/button"
import { ReactNode } from "react"

interface BotonGradienteProps {
  niños: ReactNode
  tipo?: "submit" | "button" | "reset"
  alClicear?: () => void
  claseAdicional?: string
  deshabilitado?: boolean
}

export function BotonGradiente({ 
  niños, 
  tipo = "button", 
  alClicear, 
  claseAdicional = "",
  deshabilitado = false 
}: BotonGradienteProps) {
  return (
    <Button
      type={tipo}
      onClick={alClicear}
      disabled={deshabilitado}
      className={`w-full h-12 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 text-sm sm:text-base ${claseAdicional}`}
    >
      {niños}
    </Button>
  )
}
