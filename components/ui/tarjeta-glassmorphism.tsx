import { Card } from "@/components/ui/card"
import { ReactNode } from "react"

interface TarjetaGlassmorphismProps {
  niños: ReactNode
  claseAdicional?: string
  relleno?: "sm" | "md" | "lg"
}

export function TarjetaGlassmorphism({ 
  niños, 
  claseAdicional = "", 
  relleno = "md" 
}: TarjetaGlassmorphismProps) {
  const rellenos = {
    sm: "p-4",
    md: "p-4 lg:p-6", 
    lg: "p-6 sm:p-8"
  }

  return (
    <Card className={`backdrop-blur-2xl bg-white/30 border border-white/50 rounded-3xl ${rellenos[relleno]} shadow-2xl ${claseAdicional}`}>
      {niños}
    </Card>
  )
}
