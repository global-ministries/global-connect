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
      src={process.env.NEXT_PUBLIC_LOGO_URL || "https://wcnqocyqtksxhthnquta.supabase.co/storage/v1/object/public/logos/Logo%20global.jpg"}
      alt={alt}
      width={px[tamaño]}
      height={px[tamaño]}
      className={className}
      priority={tamaño === "lg"}
    />
  )
}
