import { MapPinIcon } from "lucide-react"

interface LogoGlobalConnectProps {
  tamaño?: "sm" | "md" | "lg"
}

export function LogoGlobalConnect({ tamaño = "md" }: LogoGlobalConnectProps) {
  const tamaños = {
    sm: "w-12 h-12",
    md: "w-16 h-16", 
    lg: "w-20 h-20"
  }

  const tamañosIcono = {
    sm: "w-6 h-6",
    md: "w-8 h-8",
    lg: "w-10 h-10"
  }

  return (
    <div className={`${tamaños[tamaño]} bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center`}>
      <MapPinIcon className={`${tamañosIcono[tamaño]} text-white`} />
    </div>
  )
}
