import Image from "next/image"

interface LogoGlobalConnectProps {
  tamaño?: "sm" | "md" | "lg"
  className?: string
  alt?: string
  /** URL del logo claro (prioridad sobre env var) */
  logoLightUrl?: string | null
  /** URL del logo oscuro (prioridad sobre env var) */
  logoDarkUrl?: string | null
}

const FALLBACK_LOGO = "https://wcnqocyqtksxhthnquta.supabase.co/storage/v1/object/public/logos/Logo%20global.jpg"

/**
 * Logo del sistema. Acepta URLs de logo light/dark.
 * Si solo se pasa logoLightUrl, se usa para ambos modos.
 * Si no se pasa ninguno, usa NEXT_PUBLIC_LOGO_URL o el fallback.
 *
 * Tamaños: sm=48, md=64, lg=80px (CSS puede sobreescribir).
 */
export function LogoGlobalConnect({
  tamaño = "md",
  className,
  alt = "Global Connect",
  logoLightUrl,
  logoDarkUrl,
}: LogoGlobalConnectProps) {
  const px = {
    sm: 48,
    md: 64,
    lg: 80,
  } as const

  const lightSrc = logoLightUrl || process.env.NEXT_PUBLIC_LOGO_URL || FALLBACK_LOGO
  const darkSrc = logoDarkUrl || logoLightUrl || process.env.NEXT_PUBLIC_LOGO_URL || FALLBACK_LOGO

  // Si ambas URLs son iguales, renderizar una sola imagen
  if (lightSrc === darkSrc) {
    return (
      <Image
        src={lightSrc}
        alt={alt}
        width={px[tamaño]}
        height={px[tamaño]}
        className={className}
        priority={tamaño === "lg"}
      />
    )
  }

  // Renderizar ambos logos con dark: toggle
  return (
    <>
      <Image
        src={lightSrc}
        alt={alt}
        width={px[tamaño]}
        height={px[tamaño]}
        className={`dark:hidden ${className ?? ""}`}
        priority={tamaño === "lg"}
      />
      <Image
        src={darkSrc}
        alt={alt}
        width={px[tamaño]}
        height={px[tamaño]}
        className={`hidden dark:block ${className ?? ""}`}
        priority={tamaño === "lg"}
      />
    </>
  )
}
