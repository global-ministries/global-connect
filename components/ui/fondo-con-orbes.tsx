import { OrbesFlotantes } from "@/components/ui/orbes-flotantes"
import { ReactNode } from "react"

interface FondoConOrbesProps {
  niños: ReactNode
  claseAdicional?: string
}

export function FondoConOrbes({ niños, claseAdicional = "" }: FondoConOrbesProps) {
  return (
    <div className={`min-h-screen bg-gradient-to-br from-purple-200 via-purple-100 to-white relative overflow-hidden ${claseAdicional}`}>
      <OrbesFlotantes />
      <div className="relative z-10">
        {niños}
      </div>
    </div>
  )
}
