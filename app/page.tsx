"use client"

import { Lock, Mail, Eye, EyeOff } from "lucide-react"
import Link from "next/link"
import { useState, useEffect } from "react"
import { login } from "@/lib/actions/auth.actions"
import { createClient } from "@/lib/supabase/client"
import { LogoGlobalConnect } from "@/components/ui/logo-global-connect"
import {
  FondoAutenticacion,
  TarjetaSistema,
  InputSistema,
  BotonSistema,
  TituloSistema,
  TextoSistema,
  EnlaceSistema
} from "@/components/ui/sistema-diseno"

export default function PaginaLogin() {
  const [mostrarContrasena, setMostrarContrasena] = useState(false)
  const [email, setEmail] = useState("")
  const [contrasena, setContrasena] = useState("")
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState("")
  const [logoLight, setLogoLight] = useState<string | null>(null)
  const [logoDark, setLogoDark] = useState<string | null>(null)

  // Cargar logos de branding
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('configuracion_plataforma')
      .select('logo_light_url, logo_dark_url')
      .limit(1)
      .single()
      .then(({ data }: { data: { logo_light_url: string | null; logo_dark_url: string | null } | null }) => {
        if (data) {
          setLogoLight(data.logo_light_url)
          setLogoDark(data.logo_dark_url)
        }
      })
  }, [])

  const manejarSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setCargando(true)
    setError("")

    try {
      const result = await login(new FormData(e.currentTarget))
      if (result?.error) {
        setError(result.error)
        setCargando(false)
      }
      // Si no hay error, la función login() redirige automáticamente
      // No necesitamos hacer nada más aquí
    } catch (err) {
      // Solo mostrar error si no es una redirección exitosa
      const errorMessage = err instanceof Error ? err.message : String(err)

      // Si el error contiene "NEXT_REDIRECT", es una redirección exitosa
      if (!errorMessage.includes('NEXT_REDIRECT')) {
        setError("Error al iniciar sesión. Inténtalo de nuevo.")
        setCargando(false)
      }
      // Si es NEXT_REDIRECT, no hacer nada - la redirección está en progreso
    }
  }

  return (
    <FondoAutenticacion>
      <TarjetaSistema variante="elevated" className="space-y-8">
        {/* Encabezado */}
        <div className="text-center space-y-4">
          <LogoGlobalConnect tamaño="md" className="mx-auto w-[120px] h-auto" logoLightUrl={logoLight} logoDarkUrl={logoDark} />
          <div className="space-y-1">
            <TituloSistema nivel={1}>
              Bienvenido
            </TituloSistema>
            <TextoSistema variante="sutil" tamaño="base">
              Accede a tu cuenta de Global Connect
            </TextoSistema>
          </div>
        </div>

        {/* Formulario de Login */}
        <form className="space-y-6" onSubmit={manejarSubmit}>
          {/* Campo Email */}
          <InputSistema
            label="Correo electrónico"
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            icono={Mail}
            required
          />

          {/* Campo Contraseña */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              Contraseña
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-muted-foreground" />
              </div>
              <input
                name="password"
                type={mostrarContrasena ? "text" : "password"}
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                placeholder="Ingresa tu contraseña"
                className="block w-full py-3 pl-10 pr-12 border border-border rounded-xl bg-card focus:ring-2 focus:ring-[var(--brand-primary)]/20 focus:border-[var(--brand-primary)] transition-colors duration-200 text-foreground placeholder-muted-foreground"
                required
              />
              <button
                type="button"
                onClick={() => setMostrarContrasena(!mostrarContrasena)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
              >
                {mostrarContrasena ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Mensaje de error */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3">
              <TextoSistema variante="default" tamaño="sm" className="text-destructive">
                {error}
              </TextoSistema>
            </div>
          )}

          {/* Botón de Login */}
          <BotonSistema
            type="submit"
            variante="primario"
            tamaño="lg"
            cargando={cargando}
            className="w-full"
            disabled={!email || !contrasena}
          >
            {cargando ? "Iniciando sesión..." : "Iniciar sesión"}
          </BotonSistema>

          {/* Enlaces */}
          <div className="space-y-4">
            <div className="text-center">
              <Link href="/reset-password">
                <EnlaceSistema variante="default" className="text-sm" comoSpan>
                  ¿Olvidaste tu contraseña?
                </EnlaceSistema>
              </Link>
            </div>

            <div className="text-center">
              <TextoSistema variante="sutil" tamaño="sm" className="inline">
                ¿No tienes cuenta?{" "}
              </TextoSistema>
              <Link href="/signup">
                <EnlaceSistema variante="marca" className="text-sm" comoSpan>
                  Crear cuenta
                </EnlaceSistema>
              </Link>
            </div>
          </div>
        </form>
      </TarjetaSistema>



      {/* Pie de página */}
      <div className="text-center mt-8">
        <TextoSistema variante="muted" tamaño="sm">
          © {new Date().getFullYear()} Global Barquisimeto. Todos los derechos reservados.
        </TextoSistema>
      </div>
    </FondoAutenticacion>
  )
}