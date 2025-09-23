import Image from "next/image"

interface LogoGlobalConnectProps {
  tamaño?: "sm" | "md" | "lg"
  className?: string
  alt?: string
}

export function LogoGlobalConnect({ tamaño = "md", className, alt = "Global Connect" }: LogoGlobalConnectProps) {
  const px = {
    sm: 48,
    md: 64,
    lg: 80,
  } as const

  return (
    <Image
      src="/logo.png"
      alt={alt}
      width={px[tamaño]}
      height={px[tamaño]}
      className={className}
      priority={tamaño === "lg"}
    />
  )
}
